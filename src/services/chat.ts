/**
 * Chat between a signed-in customer and the business (papi
 * /api/storefront/chat, 2026-11-27).
 *
 *   const chat = await dash.chat.get();            // conversation, messages, catalog
 *   await dash.chat.send({ body: "<p>Hello</p>" });
 *   await dash.chat.send({ sticker: "thumbs-up" });
 *   await dash.chat.react(messageId, "👍");
 *   await dash.chat.read();
 *   const stop = dash.chat.watch((update) => ..., { everyMs: 4000 });
 *
 * The customer must be signed in (dash.auth). Message bodies are sanitized
 * HTML from the server: render them as HTML only through `<DashChat>` or your
 * own sanitizer. Cards (`kind: "widget"`) are structured data, never HTML.
 */

import type { DashClient } from "../client.js";

export type ChatWidget =
  | { type: "reminder"; title: string; when: string; note: string; url: string; action: string }
  | { type: "invoice"; title: string; amount: string; currency: string; due: string; note: string; url: string; action: string }
  | { type: "link"; title: string; note: string; url: string; action: string };

export interface ChatMessage {
  id: string;
  kind: "text" | "sticker" | "widget";
  sender_kind: "member" | "customer" | "system";
  sender_name: string;
  /** True for the signed-in customer's own messages. */
  mine: boolean;
  /** Sanitized HTML. Empty for stickers, cards and deleted messages. */
  body: string;
  sticker: string;
  widget: ChatWidget | Record<string, never>;
  deleted: boolean;
  edited: boolean;
  created_at: string;
  reply_to: { id: string; sender_name: string; excerpt: string } | null;
  attachments: { filename: string; kind: "image" | "audio" | "video" | "file"; size: number }[];
  reactions: { emoji: string; count: number; mine: boolean }[];
}

export interface ChatState {
  /** Null until the first message is sent. */
  conversation: { id: string; staff_last_read_at: string | null } | null;
  messages: ChatMessage[];
  unread: number;
  reactions: string[];
  stickers: { key: string; label: string; emoji: string }[];
  /** Pass back as `after` to get only what changed since. */
  now: string;
}

function bearer(client: DashClient): { Authorization: string } {
  const token = client.auth._accessToken;
  if (!token) throw new Error("Not authenticated");
  return { Authorization: `Bearer ${token}` };
}

/** Old and new messages as one list, oldest first, each id once (newest copy wins). */
export function mergeChatMessages(current: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  if (incoming.length === 0) return current;
  const byId = new Map(current.map((m) => [m.id, m]));
  for (const m of incoming) byId.set(m.id, m);
  return [...byId.values()].sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export class ChatModule {
  client: DashClient;
  constructor(client: DashClient) {
    this.client = client;
  }

  private url(path = ""): string {
    return `${this.client.baseURL}/api/storefront/chat${path}`;
  }

  /** The conversation. With `after` (a previous `now`), only messages that changed since. */
  async get(options: { after?: string } = {}): Promise<ChatState> {
    const query = options.after ? `?after=${encodeURIComponent(options.after)}` : "";
    return this.client._fetch(this.url() + query, { headers: bearer(this.client) });
  }

  /** Send text (HTML is sanitized by the server) or a sticker; optionally as a reply. */
  async send(message: { body?: string; sticker?: string; reply_to?: string }): Promise<ChatMessage> {
    if (!message.body && !message.sticker) throw new Error("body or sticker is required");
    return this.client._fetch(this.url("/messages"), {
      method: "POST",
      headers: bearer(this.client),
      body: JSON.stringify(message),
    });
  }

  /** Mark the conversation read: the business sees "Seen". */
  async read(): Promise<{ last_read_at: string }> {
    return this.client._fetch(this.url("/read"), { method: "POST", headers: bearer(this.client), body: "{}" });
  }

  /** Toggle a reaction (one of `ChatState.reactions`) on a message. */
  async react(messageId: string, emoji: string): Promise<ChatMessage> {
    return this.client._fetch(this.url("/react"), {
      method: "POST",
      headers: bearer(this.client),
      body: JSON.stringify({ message_id: messageId, emoji }),
    });
  }

  /**
   * Poll for changes while the tab is visible. Calls `onUpdate` with only what
   * changed. Returns a function that stops it.
   */
  watch(onUpdate: (update: ChatState) => void, options: { everyMs?: number; after?: string } = {}): () => void {
    let after = options.after ?? "";
    let stopped = false;
    const tick = async () => {
      if (stopped || (typeof document !== "undefined" && document.visibilityState !== "visible")) return;
      try {
        const update = await this.get(after ? { after } : {});
        after = update.now;
        if (!stopped) onUpdate(update);
      } catch {
        // signed out or offline: try again on the next tick
      }
    };
    const id = setInterval(tick, Math.max(2000, options.everyMs ?? 4000));
    void tick();
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }
}
