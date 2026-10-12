// @vitest-environment jsdom
/**
 * React layer (dist/react) rendered with react-dom: DashImage, CartProvider,
 * AuthProvider, MaintenancePage, useDashForm; plus the PostHog recording
 * options and the revalidate handler.
 */
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { loadV2, recorder } from "./helpers";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let V2: any;
let R: any;
beforeAll(async () => {
  V2 = await loadV2();
  R = await import("../dist/react/index.js");
  (window as any).__dash4devsConsoleWarned = true;
});

async function render(el: React.ReactElement) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(el);
  });
  return { host, root };
}

describe("DashImage", () => {
  const image = {
    url: "https://dashfordevs.nyc3.cdn.digitaloceanspaces.com/media/a.jpg",
    lqip: "data:image/webp;base64,AAAA",
    variants_ready: true,
    variants: { webp: [{ width: 640, url: "https://cdn.dashfordevs.com/content/a-640.webp" }, { width: 1280, url: "/content/a-1280.webp" }] },
  };

  it("renders the v1 markup: srcset from variants, primary >= 1024w, lazy, LQIP background", () => {
    const html = renderToString(<R.DashImage image={image} alt="A" sizes="50vw" title="t" aria-hidden="true" />);
    expect(html).toContain('src="https://cdn.dashfordevs.com/content/a-1280.webp"');
    expect(html).toContain("https://cdn.dashfordevs.com/content/a-640.webp 640w, https://cdn.dashfordevs.com/content/a-1280.webp 1280w");
    expect(html).toContain('loading="lazy"');
    expect(html).toContain("data:image/webp;base64,AAAA");
    expect(html).toContain('title="t"');
    expect(html).toContain('aria-hidden="true"');
  });

  it("absolute URLs from production render unchanged", () => {
    const html = renderToString(<R.DashImage src="https://dashfordevs.nyc3.cdn.digitaloceanspaces.com/media/b.jpg" alt="" />);
    expect(html).toContain('src="https://dashfordevs.nyc3.cdn.digitaloceanspaces.com/media/b.jpg"');
  });

  it("CDN-relative paths (papi media) resolve against cdn.dashfordevs.com", () => {
    const html = renderToString(<R.DashImage image={{ url: "/content/org/x.webp" } as any} alt="" />);
    expect(html).toContain('src="https://cdn.dashfordevs.com/content/org/x.webp"');
  });

  it("accepts a plain URL string for image at runtime", () => {
    const html = renderToString(<R.DashImage image={"https://cdn.dashfordevs.com/content/s.webp" as any} alt="" />);
    expect(html).toContain('src="https://cdn.dashfordevs.com/content/s.webp"');
  });

  it("renders nothing without a URL", () => {
    expect(renderToString(<R.DashImage alt="" />)).toBe("");
  });
});

describe("CartProvider calls the cart module correctly (v1's positional calls failed)", () => {
  it("addItem / updateItem / removeItem / clearCart", async () => {
    let cart = { cart_id: "cart_1", items: [{ id: "l1", size_id: "size_1", quantity: 1, unit_price: "5.00", total_price: "5.00" }], subtotal: "5.00", item_count: 1 };
    const { fetchMock, calls } = recorder((url) => {
      if (url.endsWith("/cart/add")) return { body: { cart_id: "cart_1", item: {}, message: "ok" } };
      if (url.includes("/clear")) cart = { ...cart, items: [], subtotal: "0.00", item_count: 0 };
      return { body: cart };
    });
    const dash = new V2.DashClient({ apiKey: "pk_test_x", fetch: fetchMock });
    let ctx: any;
    function Probe() {
      ctx = R.useCart();
      return null;
    }
    await render(
      <R.CartProvider client={dash}>
        <Probe />
      </R.CartProvider>
    );
    await act(async () => {
      await ctx.addItem("prod__1", "size_1", 2);
    });
    expect(calls.find((c) => c.url.endsWith("/api/storefront/cart/add"))!.body).toEqual({ product_id: "prod__1", size_id: "size_1", quantity: 2, cart_id: null });
    expect(ctx.cartId).toBe("cart_1");
    expect(localStorage.getItem("devdash_cart_id")).toBe("cart_1");
    expect(ctx.items).toHaveLength(1);
    await act(async () => {
      await ctx.updateItem("size_1", 3);
    });
    expect(calls.some((c) => c.url.endsWith("/api/storefront/cart/cart_1/update") && c.body.size_id === "size_1" && c.body.quantity === 3)).toBe(true);
    await act(async () => {
      await ctx.removeItem("size_1");
    });
    expect(calls.some((c) => c.method === "DELETE" && c.url.endsWith("/api/storefront/cart/cart_1/remove/size_1"))).toBe(true);
    await act(async () => {
      await ctx.clearCart();
    });
    expect(ctx.items).toEqual([]);
  });
});

describe("AuthProvider", () => {
  it("restores a saved session from v1's storage keys", async () => {
    localStorage.setItem("devdash_access_token", "tok");
    localStorage.setItem("devdash_customer", JSON.stringify({ id: "cus__1" }));
    const { fetchMock, calls } = recorder(() => ({ body: { customer: { id: "cus__1", email: "a@b.co", first_name: "A" } } }));
    const dash = new V2.DashClient({ apiKey: "pk_test_x", fetch: fetchMock });
    let ctx: any;
    function Probe() {
      ctx = R.useAuth();
      return null;
    }
    await render(
      <R.AuthProvider client={dash}>
        <Probe />
      </R.AuthProvider>
    );
    await act(async () => {});
    expect(calls.find((c) => c.url.endsWith("/auth/me"))!.headers.authorization).toBe("Bearer tok");
    expect(ctx.customer).toMatchObject({ id: "cus__1", firstName: "A" });
    await expect(ctx.register("a@b.co", "pw")).rejects.toThrow(/requestOTP/);
    localStorage.clear();
  });
});

describe("MaintenancePage and useDashForm", () => {
  it("MaintenancePage renders on the server with the auto-refresh script", () => {
    const html = renderToString(<R.MaintenancePage brand="Lost THC" message="Back soon" refreshSeconds={15} />);
    expect(html).toContain("Back soon");
    expect(html).toContain("location.reload()},15000");
  });

  it("useDashForm shows server field errors from a 422", async () => {
    const { fetchMock } = recorder((url) =>
      url.endsWith("/submit")
        ? { status: 422, body: { error: "validation", message: "Check the form", fields: { email: "invalid" } } }
        : { body: { form: { slug: "contact", fields: [{ name: "email", type: "email", label: "Email" }] } } }
    );
    const dash = new V2.DashClient({ apiKey: "pk_test_x", fetch: fetchMock });
    let form: any;
    function Form() {
      form = R.useDashForm("contact", { client: dash });
      return null;
    }
    await render(<Form />);
    await act(async () => {});
    expect(form.fields).toHaveLength(1);
    await act(async () => {
      form.setFieldValue("email", "x@y.co");
    });
    await act(async () => {
      await form.handleSubmit()();
    });
    expect(form.formError).toBe("Check the form");
    expect(form.errors).toEqual({ email: "invalid" });
  });
});

describe("PostHog session recording never captures API traffic", () => {
  it("masks inputs and disables network body/header capture", async () => {
    const ph: any = await import("posthog-js");
    const { fetchMock } = recorder(() => ({
      body: { active: true, provider: { slug: "posthog", name: "PostHog" }, providers: [{ slug: "posthog", name: "PostHog", config: { api_key: "phc_test", host: "https://us.i.posthog.com" } }] },
    }));
    const dash = new V2.DashClient({ apiKey: "pk_test_x", fetch: fetchMock });
    await dash.tracking.init();
    const [, opts] = ph.inits[ph.inits.length - 1];
    expect(opts.session_recording.maskAllInputs).toBe(true);
    expect(opts.session_recording.networkPayloadCapture).toEqual({ recordHeaders: false, recordBody: false });
    expect(opts.enable_recording_console_log).toBe(false);
  });
});

describe("createRevalidateHandler", () => {
  it("checks the secret and revalidates layout, paths and tags", async () => {
    const cache: any = await import("next/cache");
    const handler = V2.createRevalidateHandler({ secret: "s3cret" });
    const bad = await handler(new Request("https://x/api/revalidate", { method: "POST", body: JSON.stringify({ secret: "no", paths: ["/"] }) }));
    expect(bad.status).toBe(401);
    const ok = await handler(new Request("https://x/api/revalidate", { method: "POST", body: JSON.stringify({ secret: "s3cret", paths: ["/shop"], tags: ["dash4devs"] }) }));
    expect(await ok.json()).toEqual({ revalidated: ["/ (layout)", "/shop", "tag:dash4devs"] });
    expect(cache.revalidated).toContainEqual(["path", "/shop", undefined]);
  });
});

void vi;
