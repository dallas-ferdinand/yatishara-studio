import { getDeviceId } from "./session";
import type { ChatState, RunSnapshot, Session } from "./types";

const GATEWAY_TIMEOUT_MS = 10000;

async function fetchGateway(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), GATEWAY_TIMEOUT_MS);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new GatewayError("Gateway request timed out");
    }
    throw err;
  } finally {
    window.clearTimeout(timeout);
  }
}

export class GatewayError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "GatewayError";
  }
}

export class GatewayClient {
  constructor(private readonly session: Session) {}

  private url(path: string): string {
    return `${this.session.gatewayUrl}${path}`;
  }

  private headers(json = true): HeadersInit {
    const h: Record<string, string> = {
      Authorization: `Bearer ${this.session.token}`,
      "X-Mercury-Client": "desk",
      "X-Mercury-Device": this.session.deviceId,
    };
    if (this.session.userId) h["X-Mercury-User"] = this.session.userId;
    if (json) h["Content-Type"] = "application/json";
    return h;
  }

  private async parse<T>(res: Response): Promise<T> {
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      throw new GatewayError(
        String(data.message ?? data.error ?? res.statusText),
        res.status,
        typeof data.error === "string" ? data.error : undefined,
      );
    }
    return data as T;
  }

  async health(): Promise<void> {
    const res = await fetchGateway(this.url("/api/health"), { headers: this.headers(false) });
    if (!res.ok) throw new GatewayError("Gateway unreachable", res.status);
  }

  async unlock(pin: string): Promise<string> {
    const res = await fetchGateway(this.url("/api/unlock"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin, deviceId: this.session.deviceId }),
    });
    const data = await this.parse<{ ok: boolean; token?: string }>(res);
    if (!data.token) throw new GatewayError("No token in unlock response");
    return data.token;
  }

  /** Issue PIN — prints to ./m terminal + sends WhatsApp (Evolution). */
  async requestPin(label = "desk"): Promise<void> {
    const res = await fetchGateway(this.url("/api/pin/request"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Mercury-Client": "desk",
        "X-Mercury-Device": this.session.deviceId,
      },
      body: JSON.stringify({ deviceId: this.session.deviceId, label }),
    });
    await this.parse(res);
  }

  async getChats(): Promise<{ revision: number; state: ChatState | null }> {
    const res = await fetchGateway(this.url("/api/chats"), { headers: this.headers(false) });
    const data = await this.parse<{
      revision: number;
      state: ChatState | null;
    }>(res);
    return { revision: data.revision ?? 0, state: data.state };
  }

  async putChats(state: ChatState, revision: number): Promise<number> {
    const res = await fetchGateway(this.url("/api/chats"), {
      method: "PUT",
      headers: this.headers(),
      body: JSON.stringify({ state, revision }),
    });
    const data = await this.parse<{ ok: boolean; revision?: number }>(res);
    return data.revision ?? revision + 1;
  }

  async sendMessage(chatId: string, message: string, workspaceId = "mercuryos"): Promise<void> {
    const runId =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? `run_${crypto.randomUUID()}`
        : `run_${Date.now()}`;
    const res = await fetchGateway(this.url("/api/v2/chat/send"), {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ chatId, runId, message, workspaceId }),
    });
    await this.parse(res);
  }

  async pollRun(chatId: string): Promise<RunSnapshot | null> {
    const res = await fetchGateway(
      this.url(`/api/v2/runs/${encodeURIComponent(chatId)}?view=desk`),
      { headers: this.headers(false) },
    );
    const data = await this.parse<{ run: RunSnapshot | null }>(res);
    return data.run;
  }

  async cancelRun(chatId: string): Promise<void> {
    const res = await fetchGateway(this.url(`/api/v2/runs/${encodeURIComponent(chatId)}/cancel`), {
      method: "POST",
      headers: this.headers(false),
    });
    await this.parse(res);
  }
}

export async function requestUnlockPin(gatewayUrl: string): Promise<void> {
  const deviceId = getDeviceId();
  const base = gatewayUrl.replace(/\/+$/, "");
  const client = new GatewayClient({ gatewayUrl: base, token: "unused", deviceId });
  await client.requestPin("desk");
}

export async function connectWithPin(gatewayUrl: string, pin: string): Promise<Session> {
  const deviceId = getDeviceId();
  const base = gatewayUrl.replace(/\/+$/, "");
  const client = new GatewayClient({ gatewayUrl: base, token: "unused", deviceId });
  const token = await client.unlock(pin);
  const session = { gatewayUrl: base, token, deviceId };
  const authed = new GatewayClient(session);
  await authed.health();
  return session;
}

export async function connectWithPassword(
  gatewayUrl: string,
  username: string,
  password: string,
): Promise<Session> {
  const deviceId = getDeviceId();
  const base = gatewayUrl.replace(/\/+$/, "");
  const res = await fetchGateway(`${base}/api/users/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Mercury-Client": "desk" },
    body: JSON.stringify({ username, password, deviceId }),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new GatewayError(
      String(data.error ?? data.message ?? res.statusText),
      res.status,
      typeof data.error === "string" ? data.error : undefined,
    );
  }
  const token = data.token as string | undefined;
  const user = data.user as { id?: string; displayName?: string } | undefined;
  if (!token) throw new GatewayError("No token in login response");
  const session: Session = {
    gatewayUrl: base,
    token,
    deviceId,
    userId: user?.id,
    displayName: user?.displayName,
  };
  const authed = new GatewayClient(session);
  await authed.health();
  return session;
}
