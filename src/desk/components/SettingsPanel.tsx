// @ts-nocheck
"use client";

import { useState, useEffect } from "react";
import { Icon, modeIcon } from "./Icons";
import { api, initDeskAgent } from "@/desk/lib/agent-run";
import { loadLocalPrefs, updatePrefs } from "@mos-app/agent-prefs.js";
import { loadUserPrefs, updateUserPrefs } from "@mos-app/user-prefs.js";
import { importSession, clearChatStorage } from "@mos-app/store.js";
import { getDeviceId } from "@mos-app/device.js";
import { clearSession, loadSession } from "@/lib/session";

import { MERCURYOS_WORKSPACE_ID } from "@/desk/lib/workspace";
import { ThemeSettings } from "./ThemeSettings";
import { UiSoundSettings } from "./UiSoundSettings";

async function loadTikTokStatusLine() {
  try {
    const d = await api.fetchTikTokStatus();
    if (d.connected) {
      const who = d.openId ? `${String(d.openId).slice(0, 14)}…` : "linked";
      return `Connected · ${who}`;
    }
    if (d.configured) return "Not connected — tap Connect TikTok";
    return "Gateway keys not configured";
  } catch {
    try {
      const d = await api.fetchTikTokStatusFromHealth();
      if (d.connected) return "Connected";
      if (d.configured) return "Not connected — tap Connect TikTok";
      return "Gateway keys not configured";
    } catch {
      return "Unavailable — tap Connect to retry";
    }
  }
}

export function SettingsPanel({ open, onClose, chatState, onBump, onOpenPulse }) {
  const [tab, setTab] = useState("general");
  const [health, setHealth] = useState(null);
  const [mcps, setMcps] = useState([]);
  const [models, setModels] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [history, setHistory] = useState([]);
  const [prefs, setPrefs] = useState(loadLocalPrefs());
  const [userPrefs, setUserPrefs] = useState(loadUserPrefs());
  const sessionUser = loadSession();
  const [cursorStatus, setCursorStatus] = useState("");
  const [hfStatus, setHfStatus] = useState("");
  const [tiktokStatus, setTiktokStatus] = useState("");
  const [accessRequests, setAccessRequests] = useState([]);
  const [memTitle, setMemTitle] = useState("");
  const [memContent, setMemContent] = useState("");
  const [memStatus, setMemStatus] = useState("");
  const [pulseStatus, setPulseStatus] = useState(null);
  const [harness, setHarnessState] = useState(null);
  const [piKeyInput, setPiKeyInput] = useState("");
  const [piKeyStatus, setPiKeyStatus] = useState("");

  const refreshHealth = () => api.fetchHealthFull().then(setHealth).catch(() => {});
  const refreshAccess = () =>
    api.fetchAccessPending().then((d) => setAccessRequests(d.requests ?? [])).catch(() => setAccessRequests([]));
  const refreshIntegrations = () => {
    api.fetchCursorAuth().then((d) => setCursorStatus(d.email ? `Signed in · ${d.email}` : d.message ?? "Not signed in")).catch(() => setCursorStatus("Unavailable"));
    api.fetchHiggsfieldStatus().then((d) => setHfStatus(d.ok ? "Connected" : d.message ?? "Not connected")).catch(() => setHfStatus("Unavailable"));
    loadTikTokStatusLine().then(setTiktokStatus);
    refreshAccess();
  };

  useEffect(() => {
    if (!open) return;
    void initDeskAgent().then(() => {
      setPrefs(loadLocalPrefs());
      setUserPrefs(loadUserPrefs());
    });
    refreshHealth();
    refreshIntegrations();
    api.fetchMcps().then(setMcps).catch(() => {});
    api.fetchModels().then((m) => setModels(Array.isArray(m) ? m : [])).catch(() => {});
    api.fetchSessions(30, MERCURYOS_WORKSPACE_ID).then(setSessions).catch(() => {});
    api.fetchRunHistory().then(setHistory).catch(() => {});
    api.fetchPulseStatus().then(setPulseStatus).catch(() => setPulseStatus(null));
    api.fetchHarness().then(setHarnessState).catch(() => setHarnessState(null));
  }, [open]);

  if (!open) return null;

  const setGlobalMode = async (mode) => {
    const p = await updatePrefs({ mode });
    setPrefs(p);
  };

  const setGlobalModel = async (model) => {
    const p = await updatePrefs({ model, modelParams: [] });
    setPrefs(p);
  };

  const toggleMcp = async (id, enabled) => {
    try {
      if (enabled) await api.disableMcp(id);
      else await api.enableMcp(id);
      setMcps(await api.fetchMcps());
    } catch (err) {
      alert(err.message);
    }
  };

  const importDesktopSession = (s) => {
    importSession(chatState, s.agentId, s.title ?? "Desktop session", MERCURYOS_WORKSPACE_ID);
    onBump();
    onClose();
  };

  const tabs = [
    ["general", "settings", "General"],
    ["agent", "agentMode", "Agent"],
    ["integrations", "settings", "Integrations"],
    ["mcp", "settings", "MCP"],
    ["sessions", "clock", "Sessions"],
    ["system", "terminal", "System"],
  ];

  const tiktokConnected = /^Connected/.test(tiktokStatus);

  return (
    <div className="cursor-settings-overlay" role="dialog" aria-label="Settings">
      <button type="button" className="cursor-settings-backdrop" onClick={onClose} aria-label="Close settings" />
      <div className="cursor-settings-panel">
        <header className="cursor-panel-head cursor-settings-head">
          <h2 className="text-sm font-medium flex-1 min-w-0">Settings</h2>
          <div className="cursor-panel-head-tools">
            <button type="button" className="cursor-icon-btn cursor-icon-btn-sm studio-panel-close" onClick={onClose} aria-label="Close">
              <Icon name="x" size={18} />
            </button>
          </div>
        </header>

        <nav className="cursor-settings-tabs">
          {tabs.map(([id, iconName, label]) => (
            <button
              key={id}
              type="button"
              className={`cursor-settings-tab ${tab === id ? "active" : ""}`}
              onClick={() => setTab(id)}
              title={label}
            >
              <Icon name={iconName === "agentMode" ? modeIcon("agent") : iconName} size={14} />
              <span className="cursor-settings-tab-label">{label}</span>
            </button>
          ))}
        </nav>

        <div className="cursor-settings-body">
          {tab === "general" ? (
            <>
              <section className="cursor-settings-section">
                <h3>Account</h3>
                {sessionUser?.displayName || sessionUser?.userId ? (
                  <p className="text-sm text-cursor-text mb-2">
                    Signed in as <strong>{sessionUser.displayName ?? sessionUser.userId}</strong>
                  </p>
                ) : (
                  <p className="text-xs text-cursor-muted mb-2">Signed in with device code (no named user)</p>
                )}
                <button
                  type="button"
                  className="cursor-settings-action muted"
                  onClick={() => {
                    clearSession();
                    window.location.reload();
                  }}
                >
                  Sign out
                </button>
              </section>
              <section className="cursor-settings-section">
                <h3>Pulse</h3>
                <p className="text-xs text-cursor-muted mb-2">
                  Loop ops center — review reports, pause credit spend, and see recent run results.
                </p>
                <button
                  type="button"
                  className={`cursor-settings-action ${pulseStatus?.enabled !== false ? "active" : ""}`}
                  onClick={async () => {
                    const next = await api.updatePulseSettings(pulseStatus?.enabled === false);
                    setPulseStatus(next);
                  }}
                >
                  {pulseStatus?.enabled === false ? "Turn Pulse on" : "Turn Pulse off"}
                </button>
                <button
                  type="button"
                  className="cursor-settings-action muted"
                  onClick={() => {
                    onOpenPulse?.();
                    onClose?.();
                  }}
                >
                  Open Pulse tab
                </button>
              </section>
              <ThemeSettings />
              <UiSoundSettings />
              <section className="cursor-settings-section">
                <h3>Speak replies</h3>
                <p className="text-xs text-cursor-muted mb-2">
                  Read assistant replies aloud during agent runs. Toggle the speaker in the composer toolbar — pause or stop while playing.
                </p>
                <button
                  type="button"
                  className={`cursor-settings-action ${userPrefs.speakReplies ? "active" : ""}`}
                  onClick={() => {
                    const next = updateUserPrefs({ speakReplies: !userPrefs.speakReplies });
                    setUserPrefs(next);
                  }}
                >
                  {userPrefs.speakReplies ? "Auto speak on" : "Enable auto speak"}
                </button>
              </section>
              <section className="cursor-settings-section">
                <h3>Show tool calls</h3>
                <p className="text-xs text-cursor-muted mb-2">
                  When off, tool steps are hidden in the chat. The live activity pill above the composer still shows what the agent is doing.
                </p>
                <button
                  type="button"
                  className={`cursor-settings-action ${userPrefs.showToolCalls ? "active" : ""}`}
                  onClick={() => {
                    const next = updateUserPrefs({ showToolCalls: !userPrefs.showToolCalls });
                    setUserPrefs(next);
                    onBump();
                  }}
                >
                  {userPrefs.showToolCalls ? "Tool calls visible" : "Tool calls hidden"}
                </button>
              </section>
            </>
          ) : null}

          {tab === "agent" ? (
            <>
              <section className="cursor-settings-section">
                <h3>Agent engine</h3>
                <p className="text-xs text-cursor-muted mb-2">
                  Choose the agentic harness. Cursor = legacy SDK; Pi = model-agnostic (GLM) with MCP. Both harnesses now reply with rich mos-ui cards and media.
                </p>
                <div className="cursor-seg">
                  {["cursor", "pi"].map((h) => (
                    <button
                      key={h}
                      type="button"
                      className={harness?.harness === h ? "active" : ""}
                      onClick={async () => {
                        try {
                          const info = await api.setHarness(h);
                          setHarnessState(info);
                        } catch (err) {
                          alert(err.message);
                        }
                      }}
                    >
                      {h === "cursor" ? "Cursor" : "Pi"}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-cursor-muted mt-2">
                  {harness?.harness === "pi"
                    ? `Pi active · ${harness?.pi?.provider ?? "glm"}/${harness?.pi?.model ?? "glm-4.6"} ${harness?.pi?.keyPresent ? "· key set" : "· ⚠ no key"}`
                    : `Cursor active ${harness?.cursor?.keyPresent ? "· key set" : "· ⚠ no key"}`}
                </p>
                {harness?.harness === "pi" && !harness?.pi?.keyPresent && (
                  <div className="cursor-settings-action-row" style={{ marginTop: "0.5rem", display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
                    <input
                      type="password"
                      placeholder="Paste ZAI_API_KEY (from open.bigmodel.cn / z.ai)"
                      value={piKeyInput}
                      onChange={(e) => setPiKeyInput(e.target.value)}
                      style={{ flex: "1 1 240px", minWidth: "200px" }}
                      className="cursor-settings-input"
                    />
                    <button
                      type="button"
                      className="cursor-settings-action"
                      disabled={!piKeyInput.trim()}
                      onClick={async () => {
                        try {
                          setPiKeyStatus("Saving…");
                          await api.savePiApiKey(piKeyInput.trim());
                          const info = await api.fetchHarness();
                          setHarnessState(info);
                          setPiKeyInput("");
                          setPiKeyStatus(info?.pi?.keyPresent ? "Saved — Pi is ready." : "Saved, but key not detected. Check the value.");
                        } catch (err) {
                          setPiKeyStatus(`Failed: ${err.message}`);
                        }
                      }}
                    >
                      Save key
                    </button>
                    {piKeyStatus && <span className="text-xs text-cursor-muted">{piKeyStatus}</span>}
                  </div>
                )}
              </section>
              <section className="cursor-settings-section">
                <h3>Default mode</h3>
                <div className="cursor-seg">
                  {["agent", "plan", "ask"].map((m) => (
                    <button key={m} type="button" className={prefs.mode === m ? "active" : ""} onClick={() => setGlobalMode(m)}>
                      <Icon name={modeIcon(m)} size={12} /> {m}
                    </button>
                  ))}
                </div>
              </section>
              <section className="cursor-settings-section">
                <h3>Default model</h3>
                <select className="cursor-select" value={prefs.model ?? "auto"} onChange={(e) => setGlobalModel(e.target.value)}>
                  <option value="auto">Auto</option>
                  {models.map((m) => (
                    <option key={m.id ?? m.label} value={m.id ?? m.label}>
                      {m.label ?? m.id}
                    </option>
                  ))}
                </select>
              </section>
              <section className="cursor-settings-section">
                <h3>Multitask</h3>
                <p className="text-xs text-cursor-muted mb-2">
                  Allow parallel agent runs across chats when the gateway supports it.
                </p>
                <button
                  type="button"
                  className={`cursor-settings-action ${prefs.multitask ? "active" : ""}`}
                  onClick={async () => {
                    const p = await updatePrefs({ multitask: !prefs.multitask });
                    setPrefs(p);
                    refreshHealth();
                  }}
                >
                  {prefs.multitask ? "Multitask enabled" : "Enable multitask"}
                </button>
              </section>
              <section className="cursor-settings-section">
                <h3>Caveman Ultra</h3>
                <p className="text-xs text-cursor-muted mb-2">
                  Enable terse Caveman style for work replies. MOS UI can still render rich cards; JSON, code, commands, and paths stay exact.
                </p>
                <button
                  type="button"
                  className={`cursor-settings-action ${prefs.cavemanUltra !== false ? "active" : ""}`}
                  onClick={async () => {
                    const p = await updatePrefs({ cavemanUltra: prefs.cavemanUltra === false });
                    setPrefs(p);
                  }}
                >
                  {prefs.cavemanUltra === false ? "Enable Caveman Ultra" : "Caveman Ultra enabled"}
                </button>
              </section>
              <section className="cursor-settings-section text-xs text-cursor-muted leading-relaxed">
                <p>Chat commands: <code>/image prompt</code>, <code>/remember title | content</code>, <code>/build</code></p>
              </section>
            </>
          ) : null}

          {tab === "integrations" ? (
            <>
              <section className="cursor-settings-section">
                <h3>Cursor CLI</h3>
                <p className="text-xs text-cursor-muted mb-2">{cursorStatus || "Loading…"}</p>
                <button
                  type="button"
                  className="cursor-settings-action"
                  onClick={async () => {
                    setCursorStatus("Starting sign-in…");
                    try {
                      const data = await api.cursorLogin();
                      if (data.url) {
                        window.open(data.url, "_blank", "noopener");
                        setCursorStatus("Complete sign-in in the browser tab");
                      } else {
                        setCursorStatus(data.email ? `Signed in · ${data.email}` : data.message ?? "Signed in");
                      }
                      refreshHealth();
                    } catch (err) {
                      setCursorStatus(err.message);
                    }
                  }}
                >
                  Sign in to Cursor
                </button>
              </section>
              <section className="cursor-settings-section">
                <h3>Higgsfield</h3>
                <p className="text-xs text-cursor-muted mb-2">{hfStatus || "Loading…"}</p>
                <button
                  type="button"
                  className="cursor-settings-action"
                  onClick={async () => {
                    try {
                      const data = await api.higgsfieldLogin();
                      if (data.url) {
                        window.open(data.url, "_blank", "noopener");
                        setHfStatus("Complete sign-in in the browser tab");
                      } else {
                        setHfStatus(data.message ?? "Login started");
                      }
                    } catch (err) {
                      setHfStatus(err.message);
                    }
                  }}
                >
                  Sign in to Higgsfield
                </button>
              </section>
              <section className="cursor-settings-section">
                <h3>TikTok</h3>
                <p className="text-xs text-cursor-muted mb-2">{tiktokStatus || "Loading…"}</p>
                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    className="cursor-settings-action"
                    onClick={() => {
                      window.location.assign(api.tiktokConnectUrl());
                    }}
                  >
                    {tiktokConnected ? "Reconnect TikTok" : "Connect TikTok"}
                  </button>
                  {tiktokConnected ? (
                    <button
                      type="button"
                      className="cursor-settings-action muted"
                      onClick={async () => {
                        if (!confirm("Disconnect TikTok from MercuryOS?")) return;
                        try {
                          await api.tiktokDisconnect();
                          setTiktokStatus("Not connected — tap Connect TikTok");
                        } catch (err) {
                          alert(err.message);
                        }
                      }}
                    >
                      Disconnect TikTok
                    </button>
                  ) : null}
                </div>
              </section>
              <section className="cursor-settings-section">
                <h3>Web access requests</h3>
                {!accessRequests.length ? (
                  <p className="text-xs text-cursor-muted">No pending browser sign-in requests</p>
                ) : (
                  <ul className="cursor-access-list">
                    {accessRequests.map((req) => (
                      <li key={req.requestId} className="cursor-access-row">
                        <div>
                          <span className="text-sm">{req.label || "Web access"}</span>
                          <span className="text-xs text-cursor-muted block">Code {req.code}</span>
                        </div>
                        <div className="flex gap-1">
                          <button
                            type="button"
                            className="cursor-mcp-toggle"
                            onClick={async () => {
                              await api.denyAccessRequest(req.requestId);
                              refreshAccess();
                            }}
                          >
                            Deny
                          </button>
                          <button
                            type="button"
                            className="cursor-settings-action !py-1 !px-2 text-xs"
                            onClick={async () => {
                              await api.approveAccessRequest(req.requestId, getDeviceId());
                              refreshAccess();
                            }}
                          >
                            Verify
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
              <section className="cursor-settings-section">
                <h3>Add memory</h3>
                <input
                  type="text"
                  className="cursor-select mb-2"
                  placeholder="Title"
                  value={memTitle}
                  onInput={(e) => setMemTitle(e.target.value)}
                />
                <textarea
                  className="cursor-select mb-2 min-h-[72px]"
                  placeholder="Content"
                  value={memContent}
                  onInput={(e) => setMemContent(e.target.value)}
                />
                <button
                  type="button"
                  className="cursor-settings-action"
                  onClick={async () => {
                    if (!memTitle.trim() || !memContent.trim()) {
                      setMemStatus("Title and content required");
                      return;
                    }
                    setMemStatus("Saving…");
                    try {
                      const data = await api.addMemory({ title: memTitle.trim(), content: memContent.trim(), memory_type: "context" });
                      if (data.ok !== false) {
                        setMemTitle("");
                        setMemContent("");
                        setMemStatus("Saved");
                      } else {
                        setMemStatus(data.error ?? "Failed");
                      }
                    } catch (err) {
                      setMemStatus(err.message);
                    }
                  }}
                >
                  Save memory
                </button>
                {memStatus ? <p className="text-xs text-cursor-muted mt-2">{memStatus}</p> : null}
              </section>
            </>
          ) : null}

          {tab === "mcp" ? (
            <section className="cursor-settings-section">
              <h3>MCP servers</h3>
              <ul className="cursor-mcp-list">
                {mcps.map((s) => {
                  const enabled = s.status === "enabled" || s.status === "loaded" || s.enabled;
                  const needsApproval = s.status === "needs_approval";
                  const needsOAuth = needsApproval && /oauth|login|sign/i.test(String(s.detail ?? ""));
                  return (
                    <li key={s.id ?? s.name} className="cursor-mcp-row">
                      <div className="min-w-0">
                        <span className="truncate block">{s.name ?? s.id}</span>
                        {s.detail ? <span className="text-xs text-cursor-muted truncate block">{s.detail}</span> : null}
                      </div>
                      <div className="flex gap-1 shrink-0">
                        {needsOAuth ? (
                          <button
                            type="button"
                            className="cursor-settings-action !py-1 !px-2 text-xs"
                            onClick={async () => {
                              try {
                                const data = await api.loginMcp(s.id);
                                if (data.url) window.open(data.url, "_blank", "noopener");
                                setMcps(await api.fetchMcps());
                              } catch (err) {
                                alert(err.message);
                              }
                            }}
                          >
                            Sign in
                          </button>
                        ) : null}
                        <button type="button" className="cursor-mcp-toggle" onClick={() => toggleMcp(s.id, enabled)}>
                          {enabled ? "On" : "Off"}
                        </button>
                      </div>
                    </li>
                  );
                })}
                {!mcps.length ? <p className="text-cursor-muted text-sm">No MCP servers</p> : null}
              </ul>
            </section>
          ) : null}

          {tab === "sessions" ? (
            <>
              <section className="cursor-settings-section">
                <h3>Import Cursor desktop session</h3>
                <ul className="cursor-session-list">
                  {sessions.map((s) => (
                    <li key={s.agentId ?? s.id}>
                      <button type="button" className="cursor-session-row" onClick={() => importDesktopSession(s)}>
                        <span className="truncate">{s.title ?? s.agentId ?? "Session"}</span>
                        <span className="text-xs text-cursor-muted">{s.updatedAt ? new Date(s.updatedAt).toLocaleDateString() : ""}</span>
                      </button>
                    </li>
                  ))}
                  {!sessions.length ? <p className="text-cursor-muted text-sm">No sessions on gateway</p> : null}
                </ul>
              </section>
              <section className="cursor-settings-section">
                <h3>Recent runs</h3>
                <ul className="cursor-session-list">
                  {history.slice(0, 15).map((h, i) => (
                    <li key={i} className="text-xs text-cursor-muted py-1 truncate">
                      {h.chatId ?? h.id} · {h.status ?? "done"}
                    </li>
                  ))}
                </ul>
              </section>
            </>
          ) : null}

          {tab === "system" ? (
            <>
              <section className="cursor-settings-section">
                <h3>Gateway</h3>
                <div className="text-sm space-y-1">
                  <p>
                    Cursor CLI:{" "}
                    <span className={health?.cursor ? "text-emerald-400" : "text-amber-400"}>
                      {health?.cursor ? "ready" : "offline"}
                    </span>
                  </p>
                  <p>Voice: Deepgram ({health?.stt?.ready && health?.tts?.ready ? "ready" : health?.deepgram ? "on" : "off"})</p>
                  <p>Higgsfield: {health?.higgsfield?.ready || health?.higgsfield ? "on" : "off"}</p>
                  <p>TikTok: {health?.tiktok?.connected ? "connected" : health?.tiktok?.configured ? "not connected" : "off"}</p>
                </div>
              </section>
              <section className="cursor-settings-section">
                <h3>Chat cache</h3>
                <p className="text-xs text-cursor-muted mb-2">
                  Clears saved chats in this browser if the desk feels frozen or sluggish.
                </p>
                <button
                  type="button"
                  className="cursor-settings-action"
                  onClick={() => {
                    if (!confirm("Clear all saved chats in this browser? This cannot be undone.")) return;
                    clearChatStorage();
                    window.location.reload();
                  }}
                >
                  Reset chat cache
                </button>
              </section>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
