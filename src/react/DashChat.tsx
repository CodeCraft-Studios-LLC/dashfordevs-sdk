"use client";

/**
 * <DashChat>: a signed-in customer's chat with the business, for any
 * storefront (John 2026-11-27).
 *
 *   <DashChat client={dash} title="Message us" />
 *
 * Text, replies, reactions, stickers and cards (a reminder, a bill to pay, a
 * link) the business sends. Inline styles only, so it looks right on any site;
 * set `accent` to the brand colour. It polls while the tab is visible and marks
 * the conversation read when new messages are on screen.
 *
 * Safety: message HTML comes sanitized from the server and is sanitized again
 * here (an allow-list of tags, links forced to https/mailto and rel=noopener).
 * Cards are drawn from structured fields, never from HTML. Nothing is kept in
 * localStorage. Render it only for a signed-in customer.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import type { DashClient } from "../client.js";
import { mergeChatMessages, type ChatMessage, type ChatState, type ChatWidget } from "../services/chat.js";

export interface DashChatProps {
  client: DashClient;
  title?: string;
  /** Brand colour for the customer's bubbles and the send button. */
  accent?: string;
  /** CSS height of the panel. Default 32rem. */
  height?: string;
  /** Poll interval in ms (min 2000). Default 4000. */
  everyMs?: number;
  className?: string;
  /** Shown instead of the chat when no customer is signed in. */
  signedOut?: React.ReactNode;
}

const ALLOWED = new Set(["P", "BR", "STRONG", "B", "EM", "I", "U", "S", "UL", "OL", "LI", "A", "CODE", "PRE", "BLOCKQUOTE"]);

/** Second line of defence: keep only plain formatting tags; links must be https or mailto. */
export function sanitizeChatHtml(html: string): string {
  if (typeof document === "undefined") return "";
  const template = document.createElement("template");
  template.innerHTML = html;
  const walk = (node: Element) => {
    for (const child of Array.from(node.children)) {
      if (!ALLOWED.has(child.tagName)) {
        child.replaceWith(document.createTextNode(child.textContent ?? ""));
        continue;
      }
      for (const attr of Array.from(child.attributes)) {
        if (!(child.tagName === "A" && attr.name === "href")) child.removeAttribute(attr.name);
      }
      if (child.tagName === "A") {
        const href = child.getAttribute("href") ?? "";
        if (!/^(https:\/\/|mailto:)/i.test(href)) child.removeAttribute("href");
        child.setAttribute("rel", "noopener noreferrer nofollow");
        child.setAttribute("target", "_blank");
      }
      walk(child);
    }
  };
  walk(template.content as unknown as Element);
  return template.innerHTML;
}

function escapeText(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const TIME = typeof Intl !== "undefined" ? new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }) : null;
const DAY = typeof Intl !== "undefined" ? new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : null;

function Card({ widget: w, accent }: { widget: ChatWidget; accent: string }) {
  const label = w.type === "invoice" ? "Bill to pay" : w.type === "reminder" ? "Reminder" : "Link";
  const safeUrl = /^https:\/\//i.test(w.url) ? w.url : "";
  return (
    <div style={{ width: 240, maxWidth: "100%" }}>
      <div style={{ fontSize: 11, opacity: 0.7, fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 600, marginTop: 4 }}>{w.title}</div>
      {w.type === "invoice" && (
        <div style={{ fontSize: 22, fontWeight: 600, marginTop: 4 }}>
          {new Intl.NumberFormat(undefined, { style: "currency", currency: w.currency || "USD" }).format(Number(w.amount))}
          {w.due ? <span style={{ fontSize: 11, fontWeight: 400, opacity: 0.7, marginLeft: 6 }}>due {DAY?.format(new Date(w.due))}</span> : null}
        </div>
      )}
      {w.type === "reminder" && <div style={{ fontSize: 13, marginTop: 4 }}>{DAY?.format(new Date(w.when))}</div>}
      {w.note ? <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>{w.note}</div> : null}
      {safeUrl ? (
        <a
          href={safeUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{ display: "inline-block", marginTop: 10, padding: "8px 16px", borderRadius: 999, background: accent, color: "#fff", fontSize: 13, fontWeight: 600, textDecoration: "none" }}
        >
          {w.action}
        </a>
      ) : null}
    </div>
  );
}

export function DashChat({ client, title = "Messages", accent = "#09090b", height = "32rem", everyMs = 4000, className, signedOut }: DashChatProps) {
  const [state, setState] = useState<ChatState | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [picker, setPicker] = useState<"stickers" | string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const bottom = useRef<HTMLDivElement>(null);
  const count = useRef(0);
  const signedIn = Boolean(client.auth?.token);

  useEffect(() => {
    if (!signedIn) return;
    return client.chat.watch(
      (update) => {
        setState((prev) => ({ ...(prev ?? update), ...update }));
        if (update.messages.length) {
          setMessages((current) => mergeChatMessages(current, update.messages));
          if (update.messages.some((m) => !m.mine)) void client.chat.read().catch(() => {});
        }
      },
      { everyMs },
    );
  }, [client, signedIn, everyMs]);

  useEffect(() => {
    if (messages.length > count.current) bottom.current?.scrollIntoView({ block: "end" });
    count.current = messages.length;
  }, [messages.length]);

  const deliver = useCallback(async (run: () => Promise<ChatMessage>) => {
    setBusy(true);
    setError("");
    try {
      const sent = await run();
      setMessages((current) => mergeChatMessages(current, [sent]));
      setReplyTo(null);
      setPicker(null);
      return true;
    } catch (e: any) {
      setError(e?.message || "That didn't send. Try again.");
      return false;
    } finally {
      setBusy(false);
    }
  }, []);

  if (!signedIn) return <>{signedOut ?? null}</>;

  const send = async () => {
    const plain = text.trim();
    if (!plain) return;
    const body = plain.split(/\n{2,}/).map((p) => `<p>${escapeText(p).replace(/\n/g, "<br>")}</p>`).join("");
    if (await deliver(() => client.chat.send({ body, reply_to: replyTo?.id }))) setText("");
  };

  const react = async (m: ChatMessage, emoji: string) => {
    setPicker(null);
    try {
      const next = await client.chat.react(m.id, emoji);
      setMessages((current) => mergeChatMessages(current, [next]));
    } catch {
      // the next poll shows the truth
    }
  };

  const seenAt = state?.conversation?.staff_last_read_at ?? null;
  const lastSeen = seenAt ? [...messages].reverse().find((m) => m.mine && !m.deleted && m.created_at <= seenAt) : null;
  const round: React.CSSProperties = { border: "1px solid #e4e4e7", borderRadius: 999, background: "#fff", color: "#09090b", cursor: "pointer" };

  return (
    <section
      className={className}
      aria-label={title}
      style={{ display: "flex", flexDirection: "column", height, maxHeight: "100%", borderRadius: 24, overflow: "hidden", background: "#fff", color: "#09090b",
               border: "1px solid #e4e4e7", fontFamily: "system-ui, sans-serif", fontSize: 14 }}
    >
      <header style={{ padding: "12px 16px", borderBottom: "1px solid #e4e4e7", fontWeight: 600 }}>{title}</header>
      <div style={{ flex: 1, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 10 }} aria-live="polite">
        {messages.length === 0 && <p style={{ margin: "auto", color: "#71717a", fontSize: 13 }}>Write to us and we'll answer here.</p>}
        {messages.map((m) => {
          const sticker = m.kind === "sticker" ? state?.stickers.find((s) => s.key === m.sticker) : null;
          return (
            <div key={m.id} style={{ alignSelf: m.mine ? "flex-end" : "flex-start", maxWidth: "85%", textAlign: m.mine ? "right" : "left" }}>
              <div style={{ fontSize: 11, color: "#71717a", padding: "0 4px" }}>
                {m.mine ? "You" : m.sender_name} · {TIME?.format(new Date(m.created_at))}
                {m.edited && !m.deleted ? " · edited" : ""}
              </div>
              <div
                style={{ display: "inline-block", textAlign: "left", marginTop: 2, padding: sticker ? 0 : "10px 14px", borderRadius: 20,
                         background: sticker ? "transparent" : m.mine ? accent : "#f4f4f5", color: m.mine && !sticker ? "#fff" : "#09090b" }}
              >
                {m.reply_to && !m.deleted && (
                  <div style={{ fontSize: 12, opacity: 0.75, borderLeft: "2px solid currentColor", paddingLeft: 8, marginBottom: 6 }}>
                    <b>{m.reply_to.sender_name}</b>: {m.reply_to.excerpt || "Message deleted"}
                  </div>
                )}
                {m.deleted ? (
                  <i style={{ opacity: 0.7 }}>Message deleted</i>
                ) : sticker ? (
                  <span role="img" aria-label={sticker.label} style={{ fontSize: 56, lineHeight: 1 }}>{sticker.emoji}</span>
                ) : m.kind === "widget" ? (
                  <Card widget={m.widget as ChatWidget} accent={m.mine ? "#09090b" : accent} />
                ) : (
                  <div className="dash-chat-body" dangerouslySetInnerHTML={{ __html: sanitizeChatHtml(m.body) }} />
                )}
                {!m.deleted && m.attachments.length > 0 && (
                  <div style={{ fontSize: 12, opacity: 0.8, marginTop: 6 }}>
                    {m.attachments.map((a) => a.filename).join(", ")}
                  </div>
                )}
              </div>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap", justifyContent: m.mine ? "flex-end" : "flex-start", marginTop: 4, position: "relative" }}>
                {m.reactions.map((r) => (
                  <button key={r.emoji} type="button" onClick={() => void react(m, r.emoji)}
                          style={{ ...round, padding: "1px 8px", fontSize: 12, background: r.mine ? "#e4e4e7" : "#fff" }}>
                    {r.emoji} {r.count}
                  </button>
                ))}
                {!m.deleted && (
                  <>
                    <button type="button" aria-label="React" onClick={() => setPicker(picker === m.id ? null : m.id)} style={{ ...round, padding: "1px 8px", fontSize: 12 }}>
                      +
                    </button>
                    <button type="button" onClick={() => setReplyTo(m)} style={{ ...round, padding: "1px 8px", fontSize: 12 }}>
                      Reply
                    </button>
                  </>
                )}
                {picker === m.id && (
                  <div style={{ position: "absolute", bottom: "100%", [m.mine ? "right" : "left"]: 0, display: "flex", gap: 2, padding: 4, borderRadius: 999, background: "#fff",
                                border: "1px solid #e4e4e7", boxShadow: "0 12px 30px -12px rgba(0,0,0,.35)", zIndex: 2 }}>
                    {(state?.reactions ?? []).map((emoji) => (
                      <button key={emoji} type="button" onClick={() => void react(m, emoji)}
                              style={{ border: 0, background: "none", fontSize: 18, cursor: "pointer", width: 32, height: 32 }}>
                        {emoji}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {lastSeen?.id === m.id && <div style={{ fontSize: 11, color: "#71717a", padding: "0 4px" }}>Seen</div>}
            </div>
          );
        })}
        <div ref={bottom} />
      </div>
      <footer style={{ borderTop: "1px solid #e4e4e7", padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
        {replyTo && (
          <div style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12, background: "#f4f4f5", borderRadius: 14, padding: "6px 10px" }}>
            <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              Replying to {replyTo.mine ? "yourself" : replyTo.sender_name}
            </span>
            <button type="button" aria-label="Cancel reply" onClick={() => setReplyTo(null)} style={{ border: 0, background: "none", cursor: "pointer" }}>
              ✕
            </button>
          </div>
        )}
        {picker === "stickers" && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(8, 1fr)", gap: 2 }}>
            {(state?.stickers ?? []).map((s) => (
              <button key={s.key} type="button" title={s.label} aria-label={s.label} disabled={busy}
                      onClick={() => void deliver(() => client.chat.send({ sticker: s.key, reply_to: replyTo?.id }))}
                      style={{ border: 0, background: "none", fontSize: 26, cursor: "pointer", aspectRatio: "1" }}>
                {s.emoji}
              </button>
            ))}
          </div>
        )}
        {error && <div role="alert" style={{ fontSize: 12, color: "#e11d48" }}>{error}</div>}
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
          <button type="button" aria-label="Stickers" onClick={() => setPicker(picker === "stickers" ? null : "stickers")}
                  style={{ ...round, width: 40, height: 40, fontSize: 18, flexShrink: 0 }}>
            ☺
          </button>
          <div
            role="textbox"
            aria-multiline="true"
            aria-label="Write a message"
            contentEditable
            suppressContentEditableWarning
            onInput={(e) => setText((e.target as HTMLElement).innerText)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                const el = e.currentTarget;
                void send().then(() => {
                  el.innerText = "";
                });
              }
            }}
            data-placeholder="Write a message"
            style={{ flex: 1, minHeight: 40, maxHeight: 140, overflowY: "auto", padding: "10px 16px", borderRadius: 20, border: "1px solid #d4d4d8", outline: "none",
                     whiteSpace: "pre-wrap", wordBreak: "break-word" }}
          />
          <button type="button" disabled={busy || !text.trim()} onClick={(e) => {
                    const box = (e.currentTarget.previousElementSibling as HTMLElement) ?? null;
                    void send().then(() => {
                      if (box) box.innerText = "";
                    });
                  }}
                  style={{ border: 0, borderRadius: 999, height: 40, padding: "0 18px", background: accent, color: "#fff", fontWeight: 600, cursor: "pointer",
                           opacity: busy || !text.trim() ? 0.5 : 1, flexShrink: 0 }}>
            Send
          </button>
        </div>
      </footer>
    </section>
  );
}

export default DashChat;
