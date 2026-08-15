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
  const saveByok = useAction(api.userAgentKeysActions.saveMine);
  const clearByok = useMutation(api.userAgentKeys.clearMine);
  const [provider, setProvider] = useState<
    "openai" | "anthropic" | "zai" | "openrouter"
  >("openai");
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState(false);

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

  return (
    <div className="studio-settings-stack">
      <section className="cursor-settings-section">
        <div className="studio-settings-card-title">Agent Mode</div>
        <p className="studio-settings-card-copy">
          Optional API key for Agent chat reasoning. Image, video, and audio still
          use Studio credits. Leave empty to use the platform model (Seed 2.0 Pro).
          The agent runs tools directly and asks in chat only when something is unclear.
        </p>
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
