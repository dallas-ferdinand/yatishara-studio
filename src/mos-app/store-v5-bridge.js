/**
 * v5 ↔ legacy chat view bridge.
 * Source of truth: threads + runs. UI reads state.chats (materialized view).
 */
import {
  CHAT_SCHEMA_VERSION,
  createChatStateV5,
  createChatThread,
  createRunRecord,
  mergeRunsPreferComplete,
  runCompletenessScore,
  buildRunView,
  buildViewCache,
  RUN_STATUS,
} from "./chat-sdk-model.js";

function uid(prefix = "run") {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function finiteNumber(value, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function runSubmittedAt(run) {
  return finiteNumber(run?.submittedAt, finiteNumber(run?.createdAt, finiteNumber(run?.updatedAt, 0)));
}

function runOrderValue(run, fallbackIndex = 0) {
  return [
    finiteNumber(run?.turnOrdinal, Number.MAX_SAFE_INTEGER),
    runSubmittedAt(run),
    finiteNumber(run?.createdAt, 0),
    fallbackIndex,
  ];
}

function compareRunOrder(aId, bId, runs, fallbackIndex) {
  const a = runOrderValue(runs?.[aId], fallbackIndex.get(aId) ?? 0);
  const b = runOrderValue(runs?.[bId], fallbackIndex.get(bId) ?? 0);
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return String(aId).localeCompare(String(bId));
}

function normalizeThreadRunOrder(thread, runs, { preserveCurrent = false } = {}) {
  if (!thread) return thread;
  const seen = new Set();
  const ids = [];
  for (const id of thread.runIds ?? []) {
    if (!id || seen.has(id) || !runs?.[id]) continue;
    seen.add(id);
    ids.push(id);
  }
  const fallbackIndex = new Map(ids.map((id, idx) => [id, idx]));
  thread.runIds = preserveCurrent
    ? ids
    : [...ids].sort((a, b) => compareRunOrder(a, b, runs, fallbackIndex));
  thread.runIds.forEach((id, idx) => {
    const run = runs[id];
    if (!run) return;
    run.turnOrdinal = idx;
    run.submittedAt = run.submittedAt ?? run.createdAt ?? run.updatedAt ?? Date.now();
  });
  thread.lastRunId = thread.runIds.at(-1) ?? null;
  return thread;
}

function nextTurnOrdinal(thread, runs) {
  normalizeThreadRunOrder(thread, runs);
  return thread.runIds?.length ?? 0;
}

function messageRunId(msg, prefix) {
  if (msg?.runId) return msg.runId;
  const id = String(msg?.id ?? "");
  return id.startsWith(`${prefix}_run`) ? id.slice(2) : null;
}

function replaceRunIdInThread(thread, oldId, newId) {
  if (!thread || !oldId || !newId || oldId === newId) return;
  thread.runIds = (thread.runIds ?? []).map((id) => (id === oldId ? newId : id));
  if (thread.lastRunId === oldId) thread.lastRunId = newId;
}

function adoptPendingRunId(state, thread, runId) {
  if (!state?.runs || state.runs[runId]) return state?.runs?.[runId] ?? null;
  const tailId = thread.lastRunId ?? thread.runIds?.at(-1);
  const tail = tailId ? state.runs[tailId] : null;
  const adoptable =
    tail &&
    tail.chatId === thread.id &&
    !tail.requestId &&
    !tail.result &&
    !tail.viewCache;
  if (!adoptable) return null;
  delete state.runs[tailId];
  tail.runId = runId;
  state.runs[runId] = tail;
  replaceRunIdInThread(thread, tailId, runId);
  return tail;
}

function mapChatStatusToThread(status) {
  if (status === "streaming") return "active";
  if (status === "cancelling") return "active";
  if (status === "awaiting") return "awaiting_user";
  if (status === "error") return "error";
  return "idle";
}

function mapThreadStatusToChat(status) {
  if (status === "active") return "streaming";
  if (status === "awaiting_user") return "awaiting";
  if (status === "error") return "error";
  return "idle";
}

function healTerminalBlock(block) {
  if (!block || typeof block !== "object") return block;
  const out = { ...block };
  if (out.status === "running") out.status = "cancelled";
  if (out.type === "text" || out.type === "thinking") out.sealed = true;
  if (Array.isArray(out.tools)) out.tools = out.tools.map(healTerminalBlock);
  return out;
}

function healStaleLocalRuns(state) {
  if (!state?.threads || !state.runs) return state;
  const cutoff = Date.now() - 10 * 60 * 1000;
  for (const thread of state.threads) {
    let threadLive = false;
    for (const runId of thread.runIds ?? []) {
      const run = state.runs[runId];
      if (!run) continue;
      const active =
        run.status === RUN_STATUS.RUNNING ||
        run.status === RUN_STATUS.AWAITING_USER ||
        run.status === RUN_STATUS.PENDING ||
        run.status === "cancelling";
      const touchedAt = Number(run.updatedAt ?? run.createdAt ?? 0);
      if (!active || touchedAt >= cutoff) {
        if (active) threadLive = true;
        continue;
      }
      run.status = run.status === RUN_STATUS.PENDING ? RUN_STATUS.CANCELLED : RUN_STATUS.FINISHED;
      run.endedAt = run.endedAt ?? Date.now();
      run.updatedAt = Date.now();
      if (run.viewCache?.blocks?.length) {
        run.viewCache = {
          ...run.viewCache,
          blocks: run.viewCache.blocks.map(healTerminalBlock),
          sig: `${run.viewCache.sig ?? ""}|healed`,
        };
      }
    }
    if (!threadLive && (thread.status === "active" || thread.status === "awaiting_user")) {
      thread.status = "idle";
    }
  }
  return state;
}

function latestLocalUserPrompt(state, chatId) {
  const chat = state?.chats?.find((c) => c.id === chatId);
  const user = [...(chat?.messages ?? [])].reverse().find((m) => m.role === "user" && !m.queued);
  if (!user) return null;
  const text = String(user.content ?? user.text ?? "").trim();
  if (!text && !user.attachments?.length && !user.contentBlocks?.length) return null;
  return {
    text,
    attachments: user.attachments,
    contentBlocks: user.contentBlocks,
    submittedAt: user.at,
  };
}

/** v4 ChatState → v5 */
export function migrateV4ToV5(v4) {
  if (!v4?.chats?.length) {
    return createChatStateV5({
      activeId: v4?.activeId ?? null,
      deskWorkspaceId: v4?.deskWorkspaceId ?? "mercuryos",
      uiUpdatedAt: v4?.uiUpdatedAt ?? Date.now(),
      openAgentTabIds: v4?.openAgentTabIds ?? [],
      openSubagentTabs: v4?.openSubagentTabs ?? [],
      activeSubagentCallId: v4?.activeSubagentCallId ?? null,
    });
  }

  const runs = {};
  const threads = [];

  for (const chat of v4.chats) {
    const runIds = [];
    let pendingUser = null;

    for (const msg of chat.messages ?? []) {
      if (msg.role === "user") {
        pendingUser = msg;
        continue;
      }
      if (msg.role !== "assistant") continue;

      const runId = uid("run_migrated");
      const submittedAt = finiteNumber(
        pendingUser?.at,
        finiteNumber(msg.at, finiteNumber(chat.updatedAt, Date.now()))
      );
      const run = createRunRecord({
        runId,
        chatId: chat.id,
        agentId: chat.agentId ?? null,
        status: msg.streaming ? RUN_STATUS.RUNNING : RUN_STATUS.FINISHED,
        userPrompt: {
          text: String(pendingUser?.content ?? pendingUser?.text ?? "").trim() || "(migrated)",
        },
        workspaceId: chat.workspaceId ?? "mercuryos",
        model: chat.model ?? null,
        mode: chat.mode ?? null,
        createdAt: submittedAt,
        submittedAt,
        turnOrdinal: runIds.length,
        legacy: true,
        migrationNote: "v4_assistant_message",
      });
      run.endedAt = msg.at ?? chat.updatedAt ?? Date.now();
      run.result = {
        status: "finished",
        text: String(msg.content ?? "").trim() || null,
      };
      if (msg.blocks?.length) {
        run.viewCache = buildViewCache(
          msg.blocks,
          String(msg.content ?? "").trim(),
          "migrated_v4"
        );
      }
      runs[runId] = run;
      runIds.push(runId);
      pendingUser = null;
    }

    if (pendingUser) {
      const runId = uid("run_migrated");
      const submittedAt = finiteNumber(
        pendingUser.at,
        finiteNumber(chat.updatedAt, Date.now())
      );
      runs[runId] = createRunRecord({
        runId,
        chatId: chat.id,
        agentId: chat.agentId ?? null,
        status: RUN_STATUS.PENDING,
        userPrompt: { text: String(pendingUser.content ?? pendingUser.text ?? "").trim() },
        workspaceId: chat.workspaceId ?? "mercuryos",
        createdAt: submittedAt,
        submittedAt,
        turnOrdinal: runIds.length,
        legacy: true,
      });
      runIds.push(runId);
    }

    threads.push(
      createChatThread({
        id: chat.id,
        title: chat.title ?? "Chat",
        pinned: Boolean(chat.pinned),
        createdAt: chat.updatedAt ?? Date.now(),
        updatedAt: chat.updatedAt ?? Date.now(),
        agentId: chat.agentId ?? null,
        workspaceId: chat.workspaceId ?? "mercuryos",
        model: chat.model ?? null,
        mode: chat.mode ?? null,
        composerDraft: chat.composerDraft ?? "",
        pendingAttachments: chat.pendingAttachments ?? [],
        runIds,
        lastRunId: runIds.at(-1) ?? null,
        status: mapChatStatusToThread(chat.status ?? "idle"),
      })
    );
  }

  const v5 = createChatStateV5({
    activeId: v4.activeId ?? null,
    deskWorkspaceId: v4.deskWorkspaceId ?? "mercuryos",
    uiUpdatedAt: v4.uiUpdatedAt ?? Date.now(),
    openAgentTabIds: v4.openAgentTabIds ?? [],
    openSubagentTabs: v4.openSubagentTabs ?? [],
    activeSubagentCallId: v4.activeSubagentCallId ?? null,
    threads,
    runs,
  });
  syncChatsFromV5(v5);
  return v5;
}

/** Materialize legacy chats[] for UI from v5 threads + runs. */
export function syncChatsFromV5(state) {
  if (!state?.threads) return state;
  if (!state.runs) state.runs = {};

  state.chats = state.threads.map((thread) => {
    normalizeThreadRunOrder(thread, state.runs);
    const messages = [];
    for (const runId of thread.runIds ?? []) {
      const run = state.runs[runId];
      if (!run) continue;
      const userText = String(run.userPrompt?.text ?? "").trim();
      const hasUserPayload =
        userText ||
        run.userPrompt?.attachments?.length ||
        run.userPrompt?.contentBlocks?.length;
      if (hasUserPayload && userText !== "(migrated)") {
        messages.push({
          id: `u_${runId}`,
          role: "user",
          content: userText,
          at: run.submittedAt ?? run.createdAt,
          attachments: run.userPrompt?.attachments,
          contentBlocks: run.userPrompt?.contentBlocks,
          runId,
        });
      }
      const built = buildRunView(run);
      const view =
        run.viewCache ??
        buildViewCache(built.blocks, built.content, built.source ?? "sdk_messages");
      const streaming =
        run.status === RUN_STATUS.RUNNING ||
        run.status === RUN_STATUS.AWAITING_USER ||
        run.status === "cancelling";
      messages.push({
        id: `a_${runId}`,
        role: "assistant",
        content: view.content ?? "",
        blocks: view.blocks ?? [],
        flowSig: view.sig,
        streaming,
        at: run.updatedAt ?? run.createdAt,
        runId,
        requestId: run.requestId ?? null,
      });
    }

    return {
      id: thread.id,
      title: thread.title,
      pinned: thread.pinned,
      status: mapThreadStatusToChat(thread.status),
      agentId: thread.agentId,
      workspaceId: thread.workspaceId,
      model: thread.model,
      mode: thread.mode,
      composerDraft: thread.composerDraft ?? "",
      pendingAttachments: thread.pendingAttachments ?? [],
      messages,
      updatedAt: thread.updatedAt,
      lastRunId: thread.lastRunId,
    };
  });

  return state;
}

/** Push legacy chat mutations back into v5 runs (after addMessage / updateLastAssistant). */
export function syncV5FromChats(state) {
  if (state.schemaVersion !== CHAT_SCHEMA_VERSION || !state.chats) return state;
  if (!state.threads) state.threads = [];
  if (!state.runs) state.runs = {};

  const threadById = new Map(state.threads.map((t) => [t.id, t]));

  for (const chat of state.chats) {
    let thread = threadById.get(chat.id);
    if (!thread) {
      thread = createChatThread({
        id: chat.id,
        title: chat.title ?? "New chat",
        workspaceId: chat.workspaceId ?? "mercuryos",
      });
      state.threads.push(thread);
      threadById.set(chat.id, thread);
    }

    thread.title = chat.title ?? thread.title;
    thread.pinned = Boolean(chat.pinned);
    thread.agentId = chat.agentId ?? thread.agentId;
    thread.workspaceId = chat.workspaceId ?? thread.workspaceId;
    thread.model = chat.model ?? thread.model;
    thread.mode = chat.mode ?? thread.mode;
    thread.composerDraft = chat.composerDraft ?? "";
    thread.pendingAttachments = chat.pendingAttachments ?? [];
    thread.updatedAt = chat.updatedAt ?? Date.now();
    thread.status = mapChatStatusToThread(chat.status ?? "idle");
    if (!thread.runIds) thread.runIds = [];

    const msgs = chat.messages ?? [];
    const oldRunIds = thread.runIds ?? [];
    const orderedRunIds = [];
    const usedRunIds = new Set();
    let pendingUser = null;

    const allocateRunId = (preferred) => {
      if (preferred && !usedRunIds.has(preferred)) return preferred;
      const reusable = oldRunIds.find((id) => id && !usedRunIds.has(id));
      return reusable ?? uid("run");
    };

    const upsertRun = (preferredRunId, userMsg, assistantMsg, assistantIndex = -1) => {
      const runId = allocateRunId(preferredRunId);
      usedRunIds.add(runId);
      orderedRunIds.push(runId);

      const ordinal = orderedRunIds.length - 1;
      const submittedAt = finiteNumber(
        userMsg?.at,
        finiteNumber(state.runs[runId]?.submittedAt, finiteNumber(assistantMsg?.at, Date.now()))
      );
      let run = state.runs[runId];
      if (!run) {
        run = createRunRecord({
          runId,
          chatId: chat.id,
          agentId: chat.agentId,
          userPrompt: { text: "" },
          workspaceId: chat.workspaceId ?? "mercuryos",
          createdAt: submittedAt,
          submittedAt,
          turnOrdinal: ordinal,
        });
        state.runs[runId] = run;
      }

      run.chatId = chat.id;
      run.agentId = chat.agentId ?? run.agentId;
      run.workspaceId = chat.workspaceId ?? run.workspaceId ?? "mercuryos";
      run.createdAt = run.createdAt ?? submittedAt;
      run.submittedAt = submittedAt;
      run.turnOrdinal = ordinal;

      if (userMsg) {
        userMsg.runId = runId;
        run.userPrompt = {
          ...run.userPrompt,
          text: String(userMsg.content ?? userMsg.text ?? "").trim(),
          attachments: userMsg.attachments,
          contentBlocks: userMsg.contentBlocks,
          submittedAt,
        };
      }

      if (assistantMsg) {
        assistantMsg.runId = runId;
        const hasLaterAssistant = msgs
          .slice(assistantIndex + 1)
          .some((msg) => msg.role === "assistant");
        run.status = assistantMsg.streaming
          ? RUN_STATUS.RUNNING
          : !hasLaterAssistant && chat.status === "awaiting"
            ? RUN_STATUS.AWAITING_USER
            : !hasLaterAssistant && chat.status === "error"
              ? RUN_STATUS.ERROR
              : RUN_STATUS.FINISHED;
        if (assistantMsg.blocks?.length || assistantMsg.content) {
          run.viewCache = buildViewCache(
            assistantMsg.blocks ?? [],
            String(assistantMsg.content ?? ""),
            run.viewCache?.source ?? "sdk_messages"
          );
        }
        run.updatedAt = assistantMsg.at ?? run.updatedAt ?? Date.now();
      } else {
        run.status = RUN_STATUS.PENDING;
        run.updatedAt = userMsg?.at ?? run.updatedAt ?? Date.now();
      }
    };

    for (let i = 0; i < msgs.length; i++) {
      const m = msgs[i];
      if (m.role === "user") {
        if (pendingUser) {
          upsertRun(messageRunId(pendingUser, "u"), pendingUser, null);
        }
        pendingUser = m;
      } else if (m.role === "assistant") {
        const preferred = messageRunId(m, "a") ?? messageRunId(pendingUser, "u");
        upsertRun(preferred, pendingUser, m, i);
        pendingUser = null;
      }
    }
    if (pendingUser) {
      upsertRun(messageRunId(pendingUser, "u"), pendingUser, null);
    }

    thread.runIds = orderedRunIds;
    thread.lastRunId = orderedRunIds.at(-1) ?? null;
  }

  return state;
}

export function syncV5FromChat(state, chatId) {
  if (!state?.chats?.some((chat) => chat.id === chatId)) return state;
  return syncV5FromChats(state);
}

/** Merge remote v5 into local v5 (runId-keyed). */
export function mergeV5States(local, remote) {
  const out = {
    ...remote,
    schemaVersion: CHAT_SCHEMA_VERSION,
    threads: [],
    runs: { ...(remote.runs ?? {}) },
    uiUpdatedAt: Math.max(local.uiUpdatedAt ?? 0, remote.uiUpdatedAt ?? 0),
  };

  const localThreads = new Map((local.threads ?? []).map((t) => [t.id, t]));
  const remoteThreads = new Map((remote.threads ?? []).map((t) => [t.id, t]));

  for (const runId of new Set([
    ...Object.keys(local.runs ?? {}),
    ...Object.keys(remote.runs ?? {}),
  ])) {
    out.runs[runId] = mergeRunsPreferComplete(local.runs?.[runId], remote.runs?.[runId]);
  }

  for (const id of new Set([...localThreads.keys(), ...remoteThreads.keys()])) {
    const lt = localThreads.get(id);
    const rt = remoteThreads.get(id);
    if (!lt) {
      out.threads.push(rt);
      continue;
    }
    if (!rt) {
      out.threads.push(lt);
      continue;
    }
    const merged = { ...rt };
    if ((lt.updatedAt ?? 0) >= (rt.updatedAt ?? 0)) {
      merged.composerDraft = lt.composerDraft ?? rt.composerDraft;
      merged.status = lt.status ?? rt.status;
    }
    const runIdSet = new Set([...(lt.runIds ?? []), ...(rt.runIds ?? [])]);
    const fallbackIndex = new Map(
      [...(lt.runIds ?? []), ...(rt.runIds ?? [])].map((runId, idx) => [runId, idx])
    );
    merged.runIds = [...runIdSet]
      .filter((runId) => out.runs[runId])
      .sort((a, b) => compareRunOrder(a, b, out.runs, fallbackIndex));
    normalizeThreadRunOrder(merged, out.runs, { preserveCurrent: true });
    out.threads.push(merged);
  }

  syncChatsFromV5(out);
  return out;
}

export function ensureV5State(state) {
  if (!state) return createChatStateV5();
  if (state.schemaVersion === CHAT_SCHEMA_VERSION && state.threads) {
    healStaleLocalRuns(state);
    for (const thread of state.threads) {
      normalizeThreadRunOrder(thread, state.runs, { preserveCurrent: true });
    }
    syncChatsFromV5(state);
    return state;
  }
  const migrated = healStaleLocalRuns(migrateV4ToV5(state));
  for (const thread of migrated.threads ?? []) {
    normalizeThreadRunOrder(thread, migrated.runs, { preserveCurrent: true });
  }
  return migrated;
}

export function runCompleteness(state) {
  return Object.values(state?.runs ?? {}).reduce((s, r) => s + runCompletenessScore(r), 0);
}

/** Apply live gateway run snapshot into v5 state. */
export function applyGatewayRunToV5(state, chatId, runSnap, userText = "") {
  const localUserPrompt = latestLocalUserPrompt(state, chatId);
  const fallbackUserText = String(userText || localUserPrompt?.text || "").trim();
  ensureV5State(state);
  const thread = state.threads.find((t) => t.id === chatId);
  if (!thread) return null;

  const runId = runSnap.runId ?? uid("run");
  let run = state.runs[runId] ?? adoptPendingRunId(state, thread, runId);
  if (!run) {
    const submittedAt = finiteNumber(
      runSnap.submittedAt,
      finiteNumber(runSnap.createdAt, Date.now())
    );
    run = createRunRecord({
      runId,
      chatId,
      userPrompt: {
        text: fallbackUserText,
        attachments: localUserPrompt?.attachments,
        contentBlocks: localUserPrompt?.contentBlocks,
        submittedAt,
      },
      createdAt: submittedAt,
      submittedAt,
      turnOrdinal: nextTurnOrdinal(thread, state.runs),
    });
  }

  if (runSnap.agentId) run.agentId = runSnap.agentId;
  if (runSnap.requestId) run.requestId = runSnap.requestId;
  if (fallbackUserText && !String(run.userPrompt?.text ?? "").trim()) {
    run.userPrompt = {
      ...run.userPrompt,
      text: fallbackUserText,
      attachments: run.userPrompt?.attachments ?? localUserPrompt?.attachments,
      contentBlocks: run.userPrompt?.contentBlocks ?? localUserPrompt?.contentBlocks,
    };
  }
  run.submittedAt = run.submittedAt ?? run.createdAt ?? Date.now();
  const snapStatus = runSnap.status;
  run.status =
    snapStatus === "streaming" || snapStatus === "cancelling" || runSnap.streaming
      ? RUN_STATUS.RUNNING
      : snapStatus === "awaiting_input"
        ? RUN_STATUS.AWAITING_USER
        : snapStatus === "error"
          ? RUN_STATUS.ERROR
          : snapStatus === "cancelled"
            ? RUN_STATUS.CANCELLED
            : RUN_STATUS.FINISHED;

  if (runSnap.blocks?.length || runSnap.content) {
    run.viewCache = buildViewCache(
      runSnap.blocks ?? [],
      String(runSnap.content ?? ""),
      runSnap.sdkSource ?? "sdk_messages"
    );
  }

  state.runs[runId] = mergeRunsPreferComplete(state.runs[runId], run);
  if (!thread.runIds.includes(runId)) thread.runIds.push(runId);
  normalizeThreadRunOrder(thread, state.runs);
  thread.updatedAt = Date.now();
  thread.status = mapChatStatusToThread(
    snapStatus === "awaiting_input"
      ? "awaiting"
      : snapStatus === "streaming" || snapStatus === "cancelling" || runSnap.streaming
        ? "streaming"
        : snapStatus === "error"
          ? "error"
          : "idle"
  );

  syncChatsFromV5(state);
  return runId;
}

export { CHAT_SCHEMA_VERSION };
