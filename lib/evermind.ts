// Evermind client — implements EvermindClient from lib/agent.ts.
//
// Schema validated via scripts/evermind-smoke.mjs against the real API:
//   POST /api/v1/memories         { user_id, session_id, messages: [{role, timestamp, content}] } → 202 (queued)
//   POST /api/v1/memories/search  { query, filters: {user_id}, method: "hybrid", top_k }          → 200 { data: { episodes, profiles, raw_messages, agent_memory, ... } }
//
// IMPORTANT: writes are ASYNC. The 202 means "queued for processing" —
// memories take a handful of seconds to be indexed before they show up
// in search results. For demo: pre-seed Jenny's real past-event feedback
// minutes (or longer) before recording, do NOT seed live during the demo.
//
// Env:
//   EVERMIND_API_KEY   required
//   EVERMIND_BASE_URL  default https://api.evermind.ai
//   EVERMIND_USER_ID   default "jennyruan" — namespace for memories

import type { EvermindClient, EvermindMemory } from "./agent";

const DEFAULT_BASE = "https://api.evermind.ai";
const DEFAULT_USER_ID = "jennyruan";

export class HttpEvermindClient implements EvermindClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly userId: string;
  private readonly sessionId: string;

  constructor(opts?: {
    baseUrl?: string;
    apiKey?: string;
    userId?: string;
    sessionId?: string;
  }) {
    this.baseUrl = (opts?.baseUrl ?? process.env.EVERMIND_BASE_URL ?? DEFAULT_BASE).replace(/\/$/, "");
    const key = opts?.apiKey ?? process.env.EVERMIND_API_KEY;
    if (!key) {
      throw new Error("EVERMIND_API_KEY is not set");
    }
    this.apiKey = key;
    this.userId = opts?.userId ?? process.env.EVERMIND_USER_ID ?? DEFAULT_USER_ID;
    // Stable per-process session — every server request in this Node process
    // shares the same session_id so Evermind can thread them later if needed.
    this.sessionId = opts?.sessionId ?? `bs_${process.pid}_${Date.now()}`;
  }

  async searchMemories(
    query: string,
    opts: { topK?: number } = {},
  ): Promise<EvermindMemory[]> {
    const body = {
      query,
      filters: { user_id: this.userId },
      method: "hybrid",
      top_k: opts.topK ?? 5,
    };

    const res = await this.post("/api/v1/memories/search", body);
    const data = (res.data ?? {}) as {
      episodes?: unknown[];
      raw_messages?: unknown[];
      profiles?: unknown[];
      agent_memory?: unknown;
    };

    const memories: EvermindMemory[] = [];
    for (const item of data.episodes ?? []) {
      const m = normalizeMemory(item, "episode");
      if (m) memories.push(m);
    }
    for (const item of data.raw_messages ?? []) {
      const m = normalizeMemory(item, "raw_message");
      if (m) memories.push(m);
    }
    for (const item of data.profiles ?? []) {
      const m = normalizeMemory(item, "profile");
      if (m) memories.push(m);
    }
    return memories;
  }

  async addMemory(
    content: string,
    metadata: Record<string, unknown> = {},
  ): Promise<void> {
    const body = {
      user_id: this.userId,
      session_id: this.sessionId,
      messages: [
        {
          role: "user",
          timestamp: Date.now(),
          content,
          ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
        },
      ],
    };
    await this.post("/api/v1/memories", body);
  }

  private async post(path: string, body: unknown): Promise<{ data?: unknown }> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    let parsed: { data?: unknown; message?: string } = {};
    try {
      parsed = text ? JSON.parse(text) : {};
    } catch {
      // non-JSON response (rare); fall through with empty parsed
    }
    if (!res.ok) {
      const msg = parsed.message ?? text.slice(0, 300);
      throw new Error(`Evermind ${path} HTTP ${res.status}: ${msg}`);
    }
    return parsed;
  }
}

// --- Normalization --------------------------------------------------------

function normalizeMemory(item: unknown, kind: string): EvermindMemory | null {
  if (!item || typeof item !== "object") return null;
  const o = item as Record<string, unknown>;

  // Try several common id/content/time field names. Evermind returns
  // slightly different shapes per category; this is the union.
  const id =
    (o.id as string | undefined) ??
    (o.episode_id as string | undefined) ??
    (o.message_id as string | undefined) ??
    (o.uuid as string | undefined) ??
    crypto.randomUUID();

  const content =
    (o.content as string | undefined) ??
    (o.text as string | undefined) ??
    (o.summary as string | undefined) ??
    (o.body as string | undefined);
  if (!content) return null;

  const createdAt =
    (o.created_at as string | undefined) ??
    (o.timestamp as string | undefined) ??
    (typeof o.timestamp === "number" ? new Date(o.timestamp as number).toISOString() : undefined) ??
    new Date().toISOString();

  const score =
    typeof o.score === "number"
      ? o.score
      : typeof o.similarity === "number"
        ? o.similarity
        : undefined;

  return {
    id,
    content,
    createdAt,
    score,
    metadata: { ...o, _category: kind },
  };
}

// --- Lazy singleton -------------------------------------------------------

let _evermind: HttpEvermindClient | null = null;
export function getEvermind(): HttpEvermindClient {
  if (!_evermind) _evermind = new HttpEvermindClient();
  return _evermind;
}
