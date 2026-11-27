// @vitest-environment jsdom
/**
 * dash.chat (papi /api/storefront/chat) and the safety of <DashChat>'s HTML:
 * the customer's bearer token goes on every call, the client cannot name whose
 * conversation it is, and message HTML is sanitized a second time in the
 * browser (allow-listed tags, https/mailto links only).
 */
import { beforeAll, describe, expect, it } from "vitest";
import { PAPI, loadV2, recorder, withGlobalFetch } from "./helpers";
import { mergeChatMessages } from "../src/services/chat";
import { sanitizeChatHtml } from "../src/react/DashChat";

let V2: any;
beforeAll(async () => {
  V2 = await loadV2();
});

const message = (id: string, at: string, extra: Record<string, unknown> = {}) => ({
  id, kind: "text", sender_kind: "customer", sender_name: "Pat", mine: true, body: `<p>${id}</p>`, sticker: "", widget: {},
  deleted: false, edited: false, created_at: at, reply_to: null, attachments: [], reactions: [], ...extra,
});

describe("dash.chat", () => {
  it("needs a signed-in customer", async () => {
    const d = new V2.DashClient({ apiKey: "pk_live_x" });
    await expect(d.chat.get()).rejects.toThrow("Not authenticated");
    await expect(d.chat.send({ body: "<p>x</p>" })).rejects.toThrow("Not authenticated");
  });

  it("reads, sends, reacts and marks read with the customer's token", async () => {
    const { calls, fetchMock } = recorder(() => ({ body: { messages: [], now: "2026-11-27T10:00:00+00:00" } }));
    await withGlobalFetch(fetchMock, async () => {
      const d = new V2.DashClient({ apiKey: "pk_live_x" });
      d.auth.setToken("tok_customer");
      await d.chat.get({ after: "2026-11-27T09:00:00+00:00" });
      await d.chat.send({ body: "<p>Hello</p>", reply_to: "msg__1" });
      await d.chat.send({ sticker: "thumbs-up" });
      await d.chat.react("msg__1", "👍");
      await d.chat.read();
    });
    // The client's own start-up ping is not part of this.
    const chat = calls.filter((c: any) => c.url.includes("/chat"));
    expect(chat.map((c: any) => `${c.method} ${c.url.replace(PAPI, "")}`)).toEqual([
      "GET /api/storefront/chat?after=2026-11-27T09%3A00%3A00%2B00%3A00",
      "POST /api/storefront/chat/messages",
      "POST /api/storefront/chat/messages",
      "POST /api/storefront/chat/react",
      "POST /api/storefront/chat/read",
    ]);
    for (const call of chat) expect(call.headers["authorization"]).toBe("Bearer tok_customer");
    expect(chat[1].body).toEqual({ body: "<p>Hello</p>", reply_to: "msg__1" });
    expect(chat[3].body).toEqual({ message_id: "msg__1", emoji: "👍" });
  });

  it("refuses an empty message before any request", async () => {
    const d = new V2.DashClient({ apiKey: "pk_live_x" });
    d.auth.setToken("tok_customer");
    await expect(d.chat.send({})).rejects.toThrow("body or sticker");
  });

  it("merges polls into one ordered list, newest copy of a message winning", () => {
    const a = message("msg__a", "2026-11-27T10:00:00+00:00");
    const b = message("msg__b", "2026-11-27T10:01:00+00:00");
    const edited = message("msg__a", "2026-11-27T10:00:00+00:00", { body: "<p>edited</p>", edited: true });
    const merged = mergeChatMessages([b, a] as any, [edited] as any);
    expect(merged.map((m) => m.id)).toEqual(["msg__a", "msg__b"]);
    expect(merged[0].body).toBe("<p>edited</p>");
    expect(mergeChatMessages([a] as any, [])).toEqual([a]);
  });
});

describe("<DashChat> HTML safety", () => {
  it("drops scripts, handlers, styles and unsafe links", () => {
    const dirty =
      '<p onclick="steal()">Hi <b>there</b><script>alert(1)</script><img src=x onerror=alert(1)>' +
      '<a href="javascript:alert(1)" style="x">bad</a> <a href="https://example.com/a">good</a>' +
      '<iframe src="https://evil.example"></iframe></p>';
    const clean = sanitizeChatHtml(dirty);
    expect(clean).not.toMatch(/script|onerror|onclick|javascript:|iframe|<img|style=/i);
    expect(clean).toContain("<b>there</b>");
    expect(clean).toContain('href="https://example.com/a"');
    expect(clean).toContain('rel="noopener noreferrer nofollow"');
    expect(clean).toContain("<a rel="); // the javascript: link lost its href
  });
});
