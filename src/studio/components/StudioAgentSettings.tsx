"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import { toast } from "sonner";
import { friendlyConvexError } from "@/studio/lib/convexUserErrors";
import "./studio-agent.css";

/**
 * Settings → Agent — BYOK for Agent Mode reasoning (not media credits).
 */
export function StudioAgentSettings() {
  const byok = useQuery(api.userAgentKeys.getMine, {});
  const agentPreferences = useQuery(api.agentPreferences.getMine, {});
  const saveByok = useAction(api.userAgentKeysActions.saveMine);
  const clearByok = useMutation(api.userAgentKeys.clearMine);
  const setAgentPreferences = useMutation(api.agentPreferences.setMine);
  const [provider, setProvider] = useState<
    "openai" | "anthropic" | "zai" | "openrouter"
  >("openai");
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [autoApproveBusy, setAutoApproveBusy] = useState(false);
  const autoApprove = Boolean(agentPreferences?.autoApprove);

  async function handleSave() {
    if (!apiKey.trim()) {
      toast.error("Paste an API key first");
      return;
    }
    setBusy(true);
    try {
      const result = await saveByok({
        provider,
        apiKey: apiKey.trim(),
      });
      setApiKey("");
      toast.success(`Saved key ${result.keyHint}`);
    } catch (error) {
      toast.error(friendlyConvexError(error, "Could not save API key"));
    } finally {
      setBusy(false);
    }
  }

  async function handleToggleAutoApprove() {
    if (autoApproveBusy) return;
    setAutoApproveBusy(true);
    try {
      await setAgentPreferences({ autoApprove: !autoApprove });
      toast.success(!autoApprove ? "YOLO mode on" : "YOLO mode off");
    } catch (error) {
      toast.error(friendlyConvexError(error, "Could not update YOLO mode"));
    } finally {
      setAutoApproveBusy(false);
    }
  }

  return (
    <div className="studio-settings-stack">
      <section className="cursor-settings-section">
        <div className="studio-settings-card-title">Agent Mode</div>
        <p className="studio-settings-card-copy">
          Optional API key for Agent chat reasoning. Image, video, and audio still
          use Studio credits. Leave empty to use the platform model (Seed 2.0 Pro).
        </p>
        <div className="studio-settings-agent-byok-row">
          <div>
            <strong>YOLO mode</strong>
            <div className="studio-settings-card-copy">
              Skip approval prompts for risky actions and let the agent run them directly.
            </div>
          </div>
          <button
            type="button"
            className={`studio-agent-auto-toggle${autoApprove ? " is-on" : ""}`}
            aria-pressed={autoApprove}
            title={autoApprove ? "YOLO mode on" : "YOLO mode off"}
            onClick={() => void handleToggleAutoApprove()}
            disabled={autoApproveBusy}
          >
            <span className="studio-agent-auto-toggle-label">YOLO</span>
            <span className="studio-agent-auto-toggle-switch" aria-hidden="true">
              <span className="studio-agent-auto-toggle-thumb" />
            </span>
          </button>
        </div>
        {byok ? (
          <div className="studio-settings-agent-byok-row">
            <div>
              <strong>{byok.provider}</strong>
              <span> · {byok.keyHint}</span>
            </div>
            <button
              type="button"
              className="cursor-settings-action"
              onClick={() => void clearByok({})}
            >
              Remove key
            </button>
          </div>
        ) : (
          <div className="studio-settings-agent-byok-form">
            <label className="studio-settings-field">
              <span>Provider</span>
              <select
                className="cursor-input"
                value={provider}
                onChange={(e) =>
                  setProvider(
                    e.target.value as
                      | "openai"
                      | "anthropic"
                      | "zai"
                      | "openrouter",
                  )
                }
              >
                <option value="openai">OpenAI</option>
                <option value="anthropic">Anthropic (compat URL)</option>
                <option value="zai">Z.ai / GLM</option>
                <option value="openrouter">OpenRouter</option>
              </select>
            </label>
            <label className="studio-settings-field">
              <span>API key</span>
              <input
                className="cursor-input"
                type="password"
                placeholder="sk-…"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                autoComplete="off"
              />
            </label>
            <button
              type="button"
              className="cursor-settings-action is-primary"
              disabled={busy}
              onClick={() => void handleSave()}
            >
              {busy ? "Saving…" : "Save key"}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
