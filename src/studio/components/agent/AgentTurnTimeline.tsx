"use client";

import { useMemo, useState } from "react";
import {
  FileText,
  Folder,
  Image as ImageIcon,
  Music,
  Shapes,
  Video,
} from "lucide-react";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { StudioChatMarkdown } from "../StudioChatMarkdown";
import { LogoLoader } from "../logo-loader";
import { AgentApprovalStep } from "./AgentApprovalStep";
import { AgentQuestionStep, type AgentQuestionRow } from "./AgentQuestionStep";
import { AgentStepRow } from "./AgentStepRow";
import { AgentThinkingCard } from "./AgentThinkingCard";
import {
  buildAgentTurns,
  type AgentAttachmentChip,
  type AgentApprovalRow,
  type AgentMessageRow,
  type AgentPendingMedia,
  type AgentRunRow,
  type AgentToolCallRow,
  type AgentTurn,
} from "./agentStepUtils";
import { isMediaInspectTool } from "./agentToolTitles";
import "./agent-steps.css";

type AgentTurnTimelineProps = {
  messages: AgentMessageRow[];
  toolCalls: AgentToolCallRow[];
  runs: AgentRunRow[];
  approvals: AgentApprovalRow[];
  questions?: AgentQuestionRow[];
  busy?: boolean;
  activeRunId?: Id<"agentRuns"> | null;
  pendingUserText?: string | null;
  pendingAttachments?: AgentAttachmentChip[] | null;
  onDecideApproval: (
    approvalId: Id<"agentApprovals">,
    decision: "approve" | "deny",
  ) => void;
  onAnswerQuestions: (
    questionId: Id<"agentQuestions">,
    answers: Array<{
      questionId: string;
      optionId?: string;
      optionLabel?: string;
      customText?: string;
    }>,
  ) => Promise<void> | void;
  onOpenFolder?: (folderId: Id<"folders">) => void;
  onOpenDocument?: (documentId: Id<"documents">) => void;
  onOpenAsset?: (assetId: Id<"assets">) => void;
};

function chipLabel(attachment: AgentAttachmentChip) {
  return (
    attachment.label ||
    attachment.path ||
    attachment.studioId ||
    "Attachment"
  );
}

function ChipGlyph({ attachment }: { attachment: AgentAttachmentChip }) {
  const size = 11;
  if (attachment.kind === "video") return <Video size={size} aria-hidden="true" />;
  if (attachment.kind === "audio") return <Music size={size} aria-hidden="true" />;
  if (attachment.kind === "image") return <ImageIcon size={size} aria-hidden="true" />;
  if (attachment.studioKind === "folder") return <Folder size={size} aria-hidden="true" />;
  if (attachment.studioKind === "document") return <FileText size={size} aria-hidden="true" />;
  if (attachment.studioKind === "element") return <Shapes size={size} aria-hidden="true" />;
  return <FileText size={size} aria-hidden="true" />;
}

function AgentBubbleChip({
  attachment,
  previewUrl,
  resolvedKind,
}: {
  attachment: AgentAttachmentChip;
  previewUrl?: string;
  resolvedKind?: string;
}) {
  const label = chipLabel(attachment);
  const kind = resolvedKind || attachment.kind;
  const isVideo = kind === "video";
  const isImage = kind === "image";
  const showThumb = Boolean(previewUrl) && (isImage || isVideo);

  if (showThumb && previewUrl) {
    return (
      <span
        className="studio-inline-tag studio-inline-tag--preview studio-inline-tag--image-only studio-agent-attachment-chip is-static is-inline"
        title={label}
      >
        <span className="studio-inline-tag-kind">
          {isVideo ? (
            <video
              className="studio-inline-tag-media"
              src={previewUrl}
              muted
              playsInline
              preload="metadata"
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="studio-inline-tag-media" src={previewUrl} alt="" />
          )}
        </span>
      </span>
    );
  }

  return (
    <span
      className="studio-inline-tag studio-agent-attachment-chip is-static is-inline"
      title={label}
    >
      <span className="studio-inline-tag-kind">
        <ChipGlyph attachment={{ ...attachment, kind: kind || attachment.kind }} />
      </span>
      <span className="studio-inline-tag-label">{label}</span>
    </span>
  );
}

function TurnBlock({
  turn,
  expandedStepId,
  onToggleStep,
  approvalById,
  onDecideApproval,
  onAnswerQuestions,
  onOpenFolder,
  onOpenDocument,
  onOpenAsset,
  thumbById,
  questions,
}: {
  turn: AgentTurn;
  expandedStepId: string | null;
  onToggleStep: (id: string) => void;
  approvalById: Map<string, AgentApprovalRow>;
  onDecideApproval: AgentTurnTimelineProps["onDecideApproval"];
  onAnswerQuestions: AgentTurnTimelineProps["onAnswerQuestions"];
  onOpenFolder?: (folderId: Id<"folders">) => void;
  onOpenDocument?: (documentId: Id<"documents">) => void;
  onOpenAsset?: (assetId: Id<"assets">) => void;
  thumbById: Map<string, { url: string; kind: string; readUrl?: string }>;
  questions: AgentQuestionRow[];
}) {
  const inline = useMemo(
    () => splitUserTextWithAttachments(turn.userText, turn.attachments ?? []),
    [turn.userText, turn.attachments],
  );

  const previewFor = (attachment: AgentAttachmentChip) => {
    const local = attachment.thumbnailUrl || attachment.mediaUrl;
    if (local) {
      return { url: local, kind: attachment.kind };
    }
    if (attachment.studioKind === "asset" && attachment.studioId) {
      return thumbById.get(attachment.studioId);
    }
    return undefined;
  };

  const hasPendingQuestion = questions.some((q) => q.status === "pending");
  const visibleSteps = turn.steps.filter(
    (step) => !isMediaInspectTool(step.toolName),
  );
  const inspectThinking = turn.steps.some(
    (step) =>
      isMediaInspectTool(step.toolName) &&
      (step.status === "started" || step.status === "queued"),
  );
  const hasVisibleActiveStep = visibleSteps.some(
    (step) =>
      step.status === "started" ||
      step.status === "queued" ||
      step.status === "pending_approval",
  );
  const showThinking =
    turn.isLive &&
    !turn.assistantText &&
    !hasPendingQuestion &&
    (inspectThinking || !hasVisibleActiveStep);
  const primaryPreview = (turn.attachments ?? [])
    .map((attachment) => {
      const preview = previewFor(attachment);
      if (!preview?.url) return null;
      return {
        url: preview.url,
        kind: preview.kind || attachment.kind,
      };
    })
    .find(Boolean) as { url: string; kind?: string } | undefined;

  return (
    <section className="studio-agent-turn" aria-label="Agent turn">
      {inline.parts.length || turn.userText ? (
        <article className="studio-chat-bubble is-user studio-agent-user-bubble">
          {inline.parts.length
            ? inline.parts.map((part) => {
                if (part.type === "text") {
                  return <span key={part.key}>{part.value}</span>;
                }
                const preview = previewFor(part.attachment);
                return (
                  <AgentBubbleChip
                    key={part.key}
                    attachment={part.attachment}
                    previewUrl={preview?.url}
                    resolvedKind={preview?.kind || part.attachment.kind}
                  />
                );
              })
            : turn.userText}
        </article>
      ) : null}
      {inline.leftover.length ? (
        <div className="studio-agent-turn-attachments" aria-label="Attached items">
          {inline.leftover.map((attachment, index) => {
            const preview = previewFor(attachment);
            return (
              <AgentBubbleChip
                key={`${attachment.studioId ?? attachment.label ?? "attachment"}-${index}`}
                attachment={attachment}
                previewUrl={preview?.url}
                resolvedKind={preview?.kind || attachment.kind}
              />
            );
          })}
        </div>
      ) : null}

      {visibleSteps.length > 0 || showThinking ? (
        <div className="studio-agent-turn-activity">
          {visibleSteps.length > 0 ? (
            <div className="studio-agent-turn-steps" role="list">
              {visibleSteps.map((step) => {
                const approval =
                  step.approvalId != null
                    ? approvalById.get(String(step.approvalId))
                    : undefined;
                if (step.kind === "approval" && approval) {
                  return (
                    <AgentApprovalStep
                      key={step.id}
                      step={step}
                      approval={approval}
                      expanded={expandedStepId === step.id}
                      onToggle={() => onToggleStep(step.id)}
                      onDecide={onDecideApproval}
                      onOpenFolder={onOpenFolder}
                      previewUrl={primaryPreview?.url}
                      previewKind={primaryPreview?.kind}
                    />
                  );
                }
                return (
                  <AgentStepRow
                    key={step.id}
                    step={step}
                    expanded={expandedStepId === step.id}
                    onToggle={() => onToggleStep(step.id)}
                    onOpenFolder={onOpenFolder}
                    onOpenDocument={onOpenDocument}
                  />
                );
              })}
            </div>
          ) : null}
          {showThinking ? <AgentThinkingCard key="thinking" label="Thinking" /> : null}
        </div>
      ) : null}

      {questions.map((q) => (
        <AgentQuestionStep
          key={String(q._id)}
          question={q}
          onAnswer={onAnswerQuestions}
        />
      ))}

      {(() => {
        const mediaItems = turn.steps.flatMap((step) => step.media ?? []);
        const pendingItems = turn.steps
          .filter(
            (step) =>
              (step.status === "started" || step.status === "pending_approval") &&
              step.pendingMedia &&
              !(step.media && step.media.length),
          )
          .map((step) => step.pendingMedia!) as AgentPendingMedia[];
        if (!mediaItems.length && !pendingItems.length) return null;
        return (
          <div className="studio-agent-turn-media" aria-label="Generated media">
            {pendingItems.map((pending, index) => (
              <div
                key={`pending-${pending.kind}-${index}`}
                className={`studio-agent-media-card is-pending is-${pending.kind}`}
                style={{ ["--agent-gen-aspect" as string]: pending.aspectRatio }}
                role="status"
                aria-label={
                  pending.kind === "video"
                    ? "Generating video"
                    : pending.kind === "audio"
                      ? "Generating audio"
                      : "Generating image"
                }
              >
                <div className="studio-agent-media-pending-plate">
                  <LogoLoader size="md" />
                </div>
              </div>
            ))}
            {mediaItems.map((media, index) => {
              const resolved = media.assetId
                ? thumbById.get(media.assetId)
                : undefined;
              const kind = resolved?.kind || media.kind || "image";
              const previewUrl =
                media.thumbnailUrl ||
                media.url ||
                resolved?.url ||
                undefined;
              const fullUrl =
                media.url || resolved?.readUrl || resolved?.url || previewUrl;
              const key = media.assetId || `${kind}-${index}`;
              if (kind === "audio" && fullUrl) {
                return (
                  <div key={key} className="studio-agent-media-card is-audio">
                    <audio controls preload="metadata" src={fullUrl}>
                      <track kind="captions" />
                    </audio>
                    {media.name ? (
                      <span className="studio-agent-media-caption">{media.name}</span>
                    ) : null}
                    {media.assetId && onOpenAsset ? (
                      <button
                        type="button"
                        className="studio-agent-media-open"
                        onClick={() => onOpenAsset(media.assetId as Id<"assets">)}
                      >
                        Open
                      </button>
                    ) : null}
                  </div>
                );
              }
              if (kind === "video" && (fullUrl || previewUrl)) {
                return (
                  <div key={key} className="studio-agent-media-card is-video">
                    <video
                      className="studio-agent-media-frame"
                      src={fullUrl || previewUrl}
                      controls
                      playsInline
                      preload="metadata"
                    />
                    {media.name ? (
                      <span className="studio-agent-media-caption">{media.name}</span>
                    ) : null}
                    {media.assetId && onOpenAsset ? (
                      <button
                        type="button"
                        className="studio-agent-media-open"
                        onClick={() => onOpenAsset(media.assetId as Id<"assets">)}
                      >
                        Open
                      </button>
                    ) : null}
                  </div>
                );
              }
              if (previewUrl || fullUrl) {
                if (media.assetId && onOpenAsset) {
                  return (
                    <button
                      key={key}
                      type="button"
                      className="studio-agent-media-card is-image is-openable"
                      onClick={() => onOpenAsset(media.assetId as Id<"assets">)}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        className="studio-agent-media-frame"
                        src={previewUrl || fullUrl}
                        alt={media.name || "Generated image"}
                      />
                      {media.name ? (
                        <span className="studio-agent-media-caption">{media.name}</span>
                      ) : null}
                    </button>
                  );
                }
                return (
                  <div key={key} className="studio-agent-media-card is-image">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      className="studio-agent-media-frame"
                      src={previewUrl || fullUrl}
                      alt={media.name || "Generated image"}
                    />
                    {media.name ? (
                      <span className="studio-agent-media-caption">{media.name}</span>
                    ) : null}
                  </div>
                );
              }
              return null;
            })}
          </div>
        );
      })()}

      {turn.assistantText ? (
        <article className="studio-chat-bubble is-assistant">
          <StudioChatMarkdown text={turn.assistantText} />
        </article>
      ) : null}
    </section>
  );
}

function splitUserTextWithAttachments(
  text: string,
  attachments: AgentAttachmentChip[],
) {
  const parts: Array<
    | { type: "text"; key: string; value: string }
    | { type: "chip"; key: string; attachment: AgentAttachmentChip }
  > = [];
  let buffer = "";
  let tokenIndex = 0;
  let partIndex = 0;
  const used = new Set<number>();
  const flush = () => {
    if (!buffer) return;
    parts.push({ type: "text", key: `t-${partIndex++}`, value: buffer });
    buffer = "";
  };
  for (const ch of String(text ?? "")) {
    if (ch === "\uFFFC") {
      flush();
      const attachment = attachments[tokenIndex];
      if (attachment) {
        used.add(tokenIndex);
        parts.push({
          type: "chip",
          key: `c-${partIndex++}-${attachment.studioId ?? tokenIndex}`,
          attachment,
        });
      }
      tokenIndex += 1;
      continue;
    }
    buffer += ch;
  }
  flush();
  const leftover = attachments.filter((_, index) => !used.has(index));
  return { parts, leftover };
}

function collectAssetIds(
  turns: AgentTurn[],
  pendingAttachments?: AgentAttachmentChip[] | null,
): Id<"assets">[] {
  const ids = new Set<string>();
  for (const turn of turns) {
    for (const item of turn.attachments ?? []) {
      if (item.studioKind === "asset" && item.studioId) ids.add(item.studioId);
    }
    for (const step of turn.steps) {
      for (const media of step.media ?? []) {
        if (media.assetId) ids.add(media.assetId);
      }
    }
  }
  for (const item of pendingAttachments ?? []) {
    if (item.studioKind === "asset" && item.studioId) ids.add(item.studioId);
  }
  return [...ids].slice(0, 40) as Id<"assets">[];
}

export function AgentTurnTimeline({
  messages,
  toolCalls,
  runs,
  approvals,
  questions = [],
  busy,
  activeRunId,
  pendingUserText,
  pendingAttachments,
  onDecideApproval,
  onAnswerQuestions,
  onOpenFolder,
  onOpenDocument,
  onOpenAsset,
}: AgentTurnTimelineProps) {
  const [expandedStepId, setExpandedStepId] = useState<string | null>(null);

  const approvalById = useMemo(
    () => new Map(approvals.map((row) => [String(row._id), row])),
    [approvals],
  );

  const turns = useMemo(
    () =>
      buildAgentTurns({
        messages,
        toolCalls,
        runs,
        approvals,
        busy,
        activeRunId,
        pendingUserText,
        pendingAttachments,
      }),
    [
      messages,
      toolCalls,
      runs,
      approvals,
      busy,
      activeRunId,
      pendingUserText,
      pendingAttachments,
    ],
  );

  const assetIds = useMemo(
    () => collectAssetIds(turns, pendingAttachments),
    [turns, pendingAttachments],
  );
  const assets = useQuery(
    api.assets.listByIds,
    assetIds.length ? { assetIds, quality: "thumb" as const } : "skip",
  );
  const thumbById = useMemo(() => {
    const map = new Map<
      string,
      { url: string; kind: string; readUrl?: string }
    >();
    for (const asset of assets ?? []) {
      const readUrl = asset.signedReadUrl || undefined;
      const url =
        asset.signedThumbnailUrl ||
        asset.signedThumbnailLqipUrl ||
        (asset.kind === "image" || asset.kind === "video" || asset.kind === "audio"
          ? readUrl
          : undefined);
      if (url || readUrl) {
        map.set(String(asset._id), {
          url: url || readUrl!,
          kind: asset.kind,
          readUrl,
        });
      }
    }
    return map;
  }, [assets]);

  function toggleStep(id: string) {
    setExpandedStepId((prev) => (prev === id ? null : id));
  }

  const pendingQuestions = questions.filter((q) => q.status === "pending");
  const answeredQuestions = questions.filter((q) => q.status === "answered");
  const questionsByRun = useMemo(() => {
    const map = new Map<string, AgentQuestionRow[]>();
    const pool = [
      ...pendingQuestions,
      // Keep recent answered cards attached to their turn (billing-style summary).
      ...answeredQuestions.slice(-6),
    ];
    for (const q of pool) {
      const key = q.runId ? String(q.runId) : "__orphan__";
      const list = map.get(key) ?? [];
      if (list.some((row) => String(row._id) === String(q._id))) continue;
      list.push(q);
      map.set(key, list);
    }
    return map;
  }, [pendingQuestions, answeredQuestions]);
  const orphanQuestions = questionsByRun.get("__orphan__") ?? [];

  return (
    <>
      {turns.map((turn) => {
        const turnQuestions = turn.runId
          ? questionsByRun.get(String(turn.runId)) ?? []
          : [];
        const extras =
          turn.isLive && orphanQuestions.length ? orphanQuestions : [];
        const attached = [...turnQuestions, ...extras].filter(
          (q, index, arr) =>
            arr.findIndex((row) => String(row._id) === String(q._id)) === index,
        );
        return (
          <TurnBlock
            key={turn.id}
            turn={turn}
            expandedStepId={expandedStepId}
            onToggleStep={toggleStep}
            approvalById={approvalById}
            onDecideApproval={onDecideApproval}
            onAnswerQuestions={onAnswerQuestions}
            onOpenFolder={onOpenFolder}
            onOpenDocument={onOpenDocument}
            onOpenAsset={onOpenAsset}
            thumbById={thumbById}
            questions={attached}
          />
        );
      })}
      {!turns.some((t) => t.isLive)
        ? orphanQuestions.map((q) => (
            <AgentQuestionStep
              key={String(q._id)}
              question={q}
              onAnswer={onAnswerQuestions}
            />
          ))
        : null}
    </>
  );
}
