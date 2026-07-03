"use client";

import { useMutation, useQuery } from "convex/react";
import { useMemo, useState, type FormEvent } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

type CreatedKey = {
  id: Id<"apiKeys">;
  key: string;
  keyPrefix: string;
  name: string;
  scopes: string[];
};

const SCOPES = [
  { id: "read", label: "Read" },
  { id: "write", label: "Write" },
  { id: "generate", label: "Generate" },
] as const;

function buildMcpConfig(apiKey: string, apiUrl: string) {
  return JSON.stringify(
    {
      mcpServers: {
        "yatishara-studio": {
          command: "node",
          args: ["./packages/studio-mcp/dist/index.js"],
          env: {
            STUDIO_API_KEY: apiKey,
            STUDIO_API_URL: apiUrl,
          },
        },
      },
    },
    null,
    2,
  );
}

function formatLastUsed(lastUsedAt?: number) {
  if (!lastUsedAt) return "Never";
  return new Date(lastUsedAt).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function scopeLabel(scopes: string[]) {
  return scopes
    .map((scope) => SCOPES.find((item) => item.id === scope)?.label ?? scope)
    .join(" · ");
}

export function StudioApiKeysSettings() {
  const apiKeys = useQuery(api.apiKeys.list);
  const createKey = useMutation(api.apiKeys.create);
  const updateKey = useMutation(api.apiKeys.update);
  const revokeKey = useMutation(api.apiKeys.revoke);

  const [name, setName] = useState("");
  const [scopes, setScopes] = useState(["read", "generate"]);
  const [status, setStatus] = useState("");
  const [createdKey, setCreatedKey] = useState<CreatedKey | null>(null);
  const [busy, setBusy] = useState(false);
  const [editingKeyId, setEditingKeyId] = useState<Id<"apiKeys"> | null>(null);
  const [editName, setEditName] = useState("");

  const apiUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    const siteUrl = process.env.NEXT_PUBLIC_CONVEX_SITE_URL;
    if (siteUrl) return siteUrl.replace(/\/$/, "");
    return window.location.origin.replace(/\/$/, "");
  }, []);

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) {
      setStatus("Name is required.");
      return;
    }
    setBusy(true);
    setStatus("");
    try {
      const result = await createKey({
        name: name.trim(),
        scopes,
      });
      setCreatedKey(result);
      setName("");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to create API key.");
    } finally {
      setBusy(false);
    }
  }

  function startEdit(key: NonNullable<typeof apiKeys>[number]) {
    setEditingKeyId(key._id);
    setEditName(key.name);
    setStatus("");
  }

  async function handleSaveEdit(event: FormEvent) {
    event.preventDefault();
    if (!editingKeyId || !editName.trim()) return;
    setBusy(true);
    setStatus("");
    try {
      await updateKey({
        apiKeyId: editingKeyId,
        name: editName.trim(),
      });
      setEditingKeyId(null);
      setStatus("Saved.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to update API key.");
    } finally {
      setBusy(false);
    }
  }

  async function handleRevoke(apiKeyId: Id<"apiKeys">) {
    if (!window.confirm("Revoke this key? Agents using it will stop immediately.")) {
      return;
    }
    setBusy(true);
    setStatus("");
    try {
      await revokeKey({ apiKeyId });
      if (editingKeyId === apiKeyId) setEditingKeyId(null);
      setStatus("Key revoked.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to revoke API key.");
    } finally {
      setBusy(false);
    }
  }

  async function copyText(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      setStatus(`${label} copied.`);
    } catch {
      setStatus(`Could not copy ${label.toLowerCase()}.`);
    }
  }

  function toggleScope(scopeId: string) {
    setScopes((current) =>
      current.includes(scopeId)
        ? current.filter((scope) => scope !== scopeId)
        : [...current, scopeId],
    );
  }

  return (
    <div className="studio-settings-stack studio-api-keys-panel">
      <p className="studio-api-keys-lead">
        Connect Cursor or scripts to your Studio workspace. Agents start in your root folder and
        pick subfolders via MCP. Each key only sees that tree.
      </p>

      <section className="studio-api-keys-card">
        <div className="studio-settings-card-title">New key</div>
        <form className="studio-api-keys-form" onSubmit={handleCreate}>
          <div className="studio-account-fields">
            <label>
              <span>Name</span>
              <input
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Cursor agent"
                disabled={busy}
              />
            </label>
          </div>

          <div className="studio-api-keys-scope-row">
            <span className="studio-api-keys-scope-label">Access</span>
            <div className="studio-settings-chip-grid is-three" role="group" aria-label="API key scopes">
              {SCOPES.map((scope) => (
                <button
                  key={scope.id}
                  type="button"
                  className={`studio-settings-chip${scopes.includes(scope.id) ? " is-active" : ""}`}
                  onClick={() => toggleScope(scope.id)}
                  disabled={busy}
                >
                  <span>{scope.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="studio-account-actions">
            <button type="submit" className="cursor-settings-action" disabled={busy}>
              Create key
            </button>
          </div>
        </form>
      </section>

      {createdKey ? (
        <section className="studio-api-keys-card studio-api-keys-secret-card">
          <div className="studio-settings-card-title">Copy this key now</div>
          <p className="studio-settings-empty">You won&apos;t see the full key again.</p>
          <code className="studio-api-keys-secret">{createdKey.key}</code>
          <div className="studio-account-actions">
            <button type="button" className="cursor-settings-action" onClick={() => copyText(createdKey.key, "API key")}>
              Copy key
            </button>
            <button
              type="button"
              className="cursor-settings-action muted"
              onClick={() => copyText(buildMcpConfig(createdKey.key, apiUrl), "MCP config")}
            >
              Copy MCP config
            </button>
            <button type="button" className="cursor-settings-action muted" onClick={() => setCreatedKey(null)}>
              Done
            </button>
          </div>
        </section>
      ) : null}

      <section className="studio-api-keys-card">
        <div className="studio-settings-card-title">Active keys</div>
        {!apiKeys ? (
          <p className="studio-settings-empty">Loading…</p>
        ) : apiKeys.length === 0 ? (
          <p className="studio-settings-empty">No keys yet.</p>
        ) : (
          <div className="studio-api-keys-rows">
            {apiKeys.map((key) => (
              <div key={key._id} className="studio-api-keys-item">
                {editingKeyId === key._id ? (
                  <form className="studio-api-keys-edit" onSubmit={handleSaveEdit}>
                    <div className="studio-account-fields">
                      <label>
                        <span>Name</span>
                        <input
                          type="text"
                          value={editName}
                          onChange={(event) => setEditName(event.target.value)}
                          disabled={busy}
                        />
                      </label>
                    </div>
                    <div className="studio-account-actions">
                      <button type="submit" className="cursor-settings-action" disabled={busy}>
                        Save
                      </button>
                      <button
                        type="button"
                        className="cursor-settings-action muted"
                        disabled={busy}
                        onClick={() => setEditingKeyId(null)}
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : (
                  <>
                    <div className="studio-api-keys-item-copy">
                      <strong>{key.name}</strong>
                      <span>{key.keyPrefix}… · {scopeLabel(key.scopes)}</span>
                      <span>Last used {formatLastUsed(key.lastUsedAt)}</span>
                    </div>
                    <div className="studio-api-keys-item-actions">
                      <button
                        type="button"
                        className="cursor-settings-action muted"
                        disabled={busy}
                        onClick={() => startEdit(key)}
                      >
                        Rename
                      </button>
                      <button
                        type="button"
                        className="cursor-settings-action muted"
                        disabled={busy}
                        onClick={() => handleRevoke(key._id)}
                      >
                        Revoke
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {status ? <p className="studio-api-keys-status">{status}</p> : null}
    </div>
  );
}
