/**
 * v2 behaviour: choosing the API host, timeouts, retries, errors, key
 * safety, and the members v1 declared but never implemented.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { PAPI, PROD, loadV2, recorder } from "./helpers";

let V2: any;
beforeAll(async () => {
  V2 = await loadV2();
});

const ENV_KEYS = ["DASH4DEVS_API_URL", "NEXT_PUBLIC_DASH4DEVS_API_URL", "DASH4DEVS_TARGET", "NEXT_PUBLIC_DASH4DEVS_TARGET"];
afterEach(() => {
  for (const k of ENV_KEYS) delete process.env[k];
  vi.useRealTimers();
});

describe("choosing the API host: papi only", () => {
  it("defaults to papi", () => {
    const d = new V2.DashClient({ apiKey: "pk_test_x" });
    expect(d.baseURL).toBe(PAPI);
    expect(d.target).toBe("papi");
  });

  it('target: "papi" and the legacy target: "production" are both papi', () => {
    expect(new V2.DashClient({ apiKey: "pk_test_x", target: "papi" }).baseURL).toBe(PAPI);
    expect(new V2.DashClient({ apiKey: "pk_test_x", target: "production" }).baseURL).toBe(PAPI);
  });

  it("the old host in baseURL (a store's NEXT_PUBLIC_DEVDASH_API_URL) is rewritten to papi", () => {
    expect(new V2.DashClient({ apiKey: "pk_test_x", baseURL: PROD }).baseURL).toBe(PAPI);
    expect(new V2.DashClient({ apiKey: "pk_test_x", baseURL: PROD + "/" }).baseURL).toBe(PAPI);
  });

  it("a local papi is kept, trailing slash removed", () => {
    const d = new V2.DashClient({ apiKey: "pk_test_x", baseURL: "http://localhost:8000/", target: "papi" });
    expect(d.baseURL).toBe("http://localhost:8000");
    expect(d.target).toBe("custom");
  });

  it("any other host is refused in favour of papi", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    process.env.DASH4DEVS_API_URL = "https://staging.example.com/";
    expect(new V2.DashClient({ apiKey: "pk_test_x" }).baseURL).toBe(PAPI);
    expect(new V2.DashClient({ apiKey: "pk_test_x", baseURL: "https://evil.example" }).baseURL).toBe(PAPI);
    warn.mockRestore();
  });

  it("apiBase is an alias of baseURL", () => {
    expect(new V2.DashClient({ apiKey: "pk_test_x", apiBase: PAPI + "/" }).baseURL).toBe(PAPI);
  });

  it("an unknown target is an error, not a silent fallback", () => {
    expect(() => new V2.DashClient({ apiKey: "pk_test_x", target: "staging" })).toThrow(/unknown target/);
  });

  it("resolveApiBase / describeApiBase / API_TARGETS are exported", () => {
    expect(V2.API_TARGETS).toEqual({ production: PAPI, papi: PAPI });
    expect(V2.resolveApiBase({ target: "papi" })).toBe(PAPI);
    expect(V2.describeApiBase("http://localhost:8000")).toBe("custom");
  });
});

describe("key safety (same rules as v1)", () => {
  it("rejects a missing or malformed key", () => {
    expect(() => new V2.DashClient({})).toThrow("apiKey is required");
    expect(() => new V2.DashClient({ apiKey: "abc" })).toThrow("apiKey must start with 'pk_' or 'sk_'");
  });

  it("refuses to start when a NEXT_PUBLIC_ variable holds a secret key (name reported, value never)", () => {
    process.env.NEXT_PUBLIC_LEAKED_KEY = "sk_live_" + "x".repeat(20);
    try {
      let msg = "";
      try {
        new V2.DashClient({ apiKey: "pk_test_x" });
      } catch (e: any) {
        msg = e.message;
      }
      expect(msg).toContain("NEXT_PUBLIC_LEAKED_KEY");
      expect(msg).not.toContain("x".repeat(20));
    } finally {
      delete process.env.NEXT_PUBLIC_LEAKED_KEY;
    }
  });

  it("admin exists only for sk_ keys", () => {
    expect(new V2.DashClient({ apiKey: "pk_test_x" }).admin).toBeUndefined();
    expect(new V2.DashClient({ apiKey: "sk_test_x" }).admin).toBeDefined();
  });

  it("the server startup table never prints the key", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const prev = process.env.DASH4DEVS_SILENT;
    delete process.env.DASH4DEVS_SILENT;
    try {
      const key = "sk_test_" + "S3CR3TVALUE" + "wxyz";
      new V2.DashClient({ apiKey: key, baseURL: "https://unique-host-for-banner.example" });
      const printed = log.mock.calls.flat().join("\n");
      expect(printed).toContain("DashForDevs SDK v");
      expect(printed).not.toContain("S3CR3TVALUE");
      expect(printed).toContain("wxyz");
    } finally {
      process.env.DASH4DEVS_SILENT = prev;
      log.mockRestore();
    }
  });
});

describe("transport", () => {
  it("retries a GET on 503 and succeeds", async () => {
    let n = 0;
    const { fetchMock, calls } = recorder(() => (++n < 3 ? { status: 503, body: { error: "unavailable" } } : { body: { products: [] } }));
    const d = new V2.DashClient({ apiKey: "pk_test_x", fetch: fetchMock });
    await expect(d.products.list()).resolves.toEqual({ products: [] });
    expect(calls.length).toBe(3);
  });

  it("honours Retry-After on 429 (capped)", async () => {
    let n = 0;
    const { fetchMock } = recorder(() => (++n === 1 ? { status: 429, body: { error: "Rate limit exceeded" }, headers: { "retry-after": "0" } } : { body: { ok: 1 } }));
    const d = new V2.DashClient({ apiKey: "pk_test_x", fetch: fetchMock });
    await expect(d.ping()).resolves.toEqual({ ok: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("never retries a POST (a repeated charge could bill twice)", async () => {
    const { fetchMock } = recorder(() => ({ status: 503, body: { error: "unavailable", message: "try later" } }));
    const d = new V2.DashClient({ apiKey: "pk_test_x", fetch: fetchMock });
    await expect(d.payment.charge({ token: "t", amount: 1 })).rejects.toMatchObject({ status: 503, retryable: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not retry papi's deliberate 503 (PHI/payments gate, available: false)", async () => {
    const gate = { error: "not_available_yet", message: "Customer data moves after the HIPAA agreement", available: false, reason: "phi_gate" };
    const { fetchMock } = recorder(() => ({ status: 503, body: gate }));
    const d = new V2.DashClient({ apiKey: "pk_test_x", target: "papi", fetch: fetchMock });
    d.auth.setToken("tok");
    const err = await d.auth.getProfile().catch((e: any) => e);
    expect(err).toMatchObject({ status: 503, code: "not_available_yet", details: gate, retryable: false });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not retry 4xx or 500", async () => {
    for (const status of [400, 404, 500]) {
      const { fetchMock } = recorder(() => ({ status, body: { error: "e" } }));
      const d = new V2.DashClient({ apiKey: "pk_test_x", fetch: fetchMock });
      await expect(d.ping()).rejects.toMatchObject({ status });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    }
  });

  it("retries a network error, then reports it as DashApiError(network_error)", async () => {
    const fetchMock = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    const d = new V2.DashClient({ apiKey: "pk_test_x", fetch: fetchMock, retries: 1 });
    const err = await d.ping().catch((e: any) => e);
    expect(err).toBeInstanceOf(V2.DashApiError);
    expect(err).toMatchObject({ status: 0, code: "network_error", retryable: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("times out a hung request", async () => {
    const fetchMock = vi.fn(
      (_u: string, init: any) =>
        new Promise((_res, rej) => {
          init.signal?.addEventListener("abort", () => rej(Object.assign(new Error("aborted"), { name: "AbortError" })));
        })
    );
    const d = new V2.DashClient({ apiKey: "pk_test_x", fetch: fetchMock, timeoutMs: 30, retries: 0 });
    await expect(d.ping()).rejects.toMatchObject({ code: "timeout", status: 0 });
  });

  it("a caller's AbortSignal aborts without retrying", async () => {
    const fetchMock = vi.fn(
      (_u: string, init: any) =>
        new Promise((_res, rej) => {
          init.signal?.addEventListener("abort", () => rej(Object.assign(new Error("aborted"), { name: "AbortError" })));
        })
    );
    const d = new V2.DashClient({ apiKey: "pk_test_x", fetch: fetchMock });
    const ac = new AbortController();
    const p = d._fetch(`${d.baseURL}/api/storefront/ping`, { signal: ac.signal });
    ac.abort();
    await expect(p).rejects.toMatchObject({ code: "aborted" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("a non-JSON error (e.g. HTML from a proxy) is a DashApiError, not a SyntaxError", async () => {
    const { fetchMock } = recorder(() => ({ status: 500, text: "<html>Server Error</html>" }));
    const d = new V2.DashClient({ apiKey: "pk_test_x", fetch: fetchMock });
    const err = await d.sitemap.get().catch((e: any) => e);
    expect(err).toBeInstanceOf(V2.DashApiError);
    expect(err).toMatchObject({ status: 500, code: "invalid_response" });
    expect(err.message).toContain("HTTP 500");
  });

  it("error.url never carries the query string (it can hold identifiers)", async () => {
    const { fetchMock } = recorder(() => ({ status: 404, body: { error: "not_found", message: "nope" } }));
    const d = new V2.DashClient({ apiKey: "pk_test_x", fetch: fetchMock });
    const err = await d.checkout.resume("checkout__secret-token").catch((e: any) => e);
    expect(err.url).toBe(`${PAPI}/api/storefront/checkout/resume`);
    expect(JSON.stringify(err)).not.toContain("secret-token");
  });

  it("422 field errors are on error.fields (useDashForm shows them)", async () => {
    const { fetchMock } = recorder(() => ({ status: 422, body: { error: "validation", message: "Invalid", fields: { email: "required" } } }));
    const d = new V2.DashClient({ apiKey: "pk_test_x", fetch: fetchMock });
    const err = await d.forms.submit("contact", { answers: {} }).catch((e: any) => e);
    expect(err.fields).toEqual({ email: "required" });
    expect(err.details.fields).toEqual({ email: "required" });
  });

  it("an empty 2xx body is {} (v1 threw a JSON parse error)", async () => {
    const { fetchMock } = recorder(() => ({ status: 200, text: "" }));
    const d = new V2.DashClient({ apiKey: "pk_test_x", fetch: fetchMock });
    await expect(d.ping()).resolves.toEqual({});
  });

  it("anonymous server GETs in production builds use the Next data cache (v1 behaviour)", async () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    process.env.DASH4DEVS_REVALIDATE = "120";
    try {
      const seen: any[] = [];
      const fetchMock = vi.fn(async (_u: string, init: any) => {
        seen.push(init);
        return new Response("{}", { status: 200 });
      });
      const d = new V2.DashClient({ apiKey: "pk_test_x", fetch: fetchMock });
      await d.products.list();
      expect(seen[0].next).toEqual({ revalidate: 120, tags: ["dash4devs"] });
      expect(seen[0].signal).toBeUndefined(); // keeps Next's request memoization
      d.auth.setToken("tok");
      await d.products.list();
      expect(seen[1].next).toBeUndefined();
    } finally {
      process.env.NODE_ENV = prev;
      delete process.env.DASH4DEVS_REVALIDATE;
    }
  });
});

describe("members v1 declared but did not implement (now real)", () => {
  it("auth.accessToken / setTokens / clearTokens / refresh / verifyOTP(email, code)", async () => {
    const { fetchMock, calls } = recorder();
    const d = new V2.DashClient({ apiKey: "pk_test_x", fetch: fetchMock });
    d.auth.setTokens("a1", "r1");
    expect(d.auth.accessToken).toBe("a1");
    await d.auth.refresh();
    expect(calls[0].url).toBe(`${PAPI}/api/storefront/auth/refresh`);
    expect(calls[0].body).toEqual({ refresh_token: "r1" });
    d.auth.clearTokens();
    expect(d.auth.token).toBeNull();
    await d.auth.verifyOTP("a@b.co", "123456");
    expect(calls[1].body).toEqual({ email: "a@b.co", code: "123456" });
  });

  it("blog.categories() is listCategories()", async () => {
    const { fetchMock, calls } = recorder();
    const d = new V2.DashClient({ apiKey: "pk_test_x", fetch: fetchMock });
    await d.blog.categories();
    expect(calls[0].url).toBe(`${PAPI}/api/storefront/blog/categories`);
  });

  it("products.get forwards its declared options as query parameters", async () => {
    const { fetchMock, calls } = recorder();
    const d = new V2.DashClient({ apiKey: "pk_test_x", fetch: fetchMock });
    await d.products.get("slug", { variation: "strain-a", skip: undefined });
    expect(calls[0].url).toBe(`${PAPI}/api/storefront/products/slug?variation=strain-a`);
  });
});
