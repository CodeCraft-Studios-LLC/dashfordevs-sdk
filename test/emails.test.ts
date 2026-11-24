/**
 * dash.admin.sendEmail: the emails API with the client's one sk_ key
 * (X-API-Key), at papi /emails/v1/. There is no separate emails key.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { PAPI, loadV2, recorder, withGlobalFetch } from "./helpers";

let V2: any;
beforeAll(async () => {
  V2 = await loadV2();
});

describe("admin emails", () => {
  it("sends with X-API-Key to /emails/v1/emails, template + data and Idempotency-Key", async () => {
    const { calls, fetchMock } = recorder(() => ({ status: 201, body: { id: "msg__1", status: "queued" } }));
    const sent = await withGlobalFetch(fetchMock, async () => {
      const d = new V2.DashClient({ apiKey: "sk_live_x" });
      return d.admin.sendEmail(
        { from: "hi@example.com", to: "pat@example.com", template: "lead-intro", data: { business: "Acme" } },
        { idempotencyKey: "lead-1-step-1" },
      );
    });
    expect(sent.id).toBe("msg__1");
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe(`${PAPI}/emails/v1/emails`);
    expect(calls[0].headers["x-api-key"]).toBe("sk_live_x");
    expect(calls[0].headers["authorization"]).toBeUndefined();
    expect(calls[0].body).toEqual({ from: "hi@example.com", to: "pat@example.com", template: "lead-intro", data: { business: "Acme" } });
    const init = fetchMock.mock.calls[0][1];
    const raw = init.headers instanceof Headers ? Object.fromEntries(init.headers.entries()) : init.headers;
    expect(raw["Idempotency-Key"] ?? raw["idempotency-key"]).toBe("lead-1-step-1");
  });

  it("reads status and mailboxes", async () => {
    const { calls, fetchMock } = recorder(() => ({ body: { id: "msg__1", status: "delivered", mailboxes: [] } }));
    await withGlobalFetch(fetchMock, async () => {
      const d = new V2.DashClient({ apiKey: "sk_live_x" });
      await d.admin.getEmail("msg__1");
      await d.admin.listMailboxes();
    });
    expect(calls.map((c) => c.url)).toEqual([`${PAPI}/emails/v1/emails/msg__1`, `${PAPI}/emails/v1/mailboxes`]);
    expect(calls.every((c) => c.headers["x-api-key"] === "sk_live_x")).toBe(true);
  });
});
