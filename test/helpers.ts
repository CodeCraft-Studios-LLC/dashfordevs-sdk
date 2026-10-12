import { vi } from "vitest";
import path from "node:path";
import { pathToFileURL } from "node:url";

process.env.DASH4DEVS_SILENT = "1";

export const ROOT = path.resolve(__dirname, "..");
export const PROD = "https://api.dashfordevs.com";
export const PAPI = "https://papi.dashfordevs.com";

export async function loadV1(): Promise<any> {
  return import(pathToFileURL(path.join(ROOT, "test/v1-snapshot/index.js")).href);
}
export async function loadV2(): Promise<any> {
  return import(pathToFileURL(path.join(ROOT, "dist/index.js")).href);
}

export interface RecordedCall {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: any;
}

const KEPT_HEADERS = ["x-api-key", "content-type", "authorization"];

function normalizeHeaders(h: any): Record<string, string> {
  const out: Record<string, string> = {};
  if (!h) return out;
  const entries: [string, string][] =
    typeof Headers !== "undefined" && h instanceof Headers ? Array.from(h.entries()) : Object.entries(h);
  for (const [k, v] of entries) {
    if (KEPT_HEADERS.includes(k.toLowerCase())) out[k.toLowerCase()] = String(v);
  }
  return out;
}

export type Responder = (url: string, init: any) => { status?: number; body?: any; text?: string; headers?: Record<string, string> };

/** A universal body that satisfies every module's post-processing. */
export const UNIVERSAL = {
  ok: true,
  message: "ok",
  cart_id: "cart_1",
  items: [
    { id: "line_1", size_id: "size_1", quantity: 2, unit_price: "1.00", total_price: "2.00", product_name: "Thing" },
  ],
  subtotal: "2.00",
  item_count: 1,
  total: 1,
  rates: [
    { serviceName: "Slow", serviceCode: "slow", shipmentCost: 3, otherCost: 0, transitDays: 5 },
    { serviceName: "Fast", serviceCode: "fast", shipmentCost: 9, otherCost: 1, transitDays: 1 },
  ],
  product: { id: "prod__1", files: [{ id: "f1", label: "coa", url: "https://x/coa.pdf", name: "COA", order: 0 }, { id: "f2", label: "manual", url: "https://x/m.pdf", name: "M", order: 1 }] },
  category: { id: "cat__1", files: [{ id: "f3", label: "menu", url: "https://x/menu.pdf", name: "Menu", order: 0 }] },
  access_token: "access_1",
  refresh_token: "refresh_1",
  customer: { id: "cus__1", email: "c@example.com" },
  processor: { slug: "quickbooks", environment: "test", payment_type: "invoice" },
  client_config: {},
  global: { min_for_free_shipping: "50.00" },
  total_tax: "1.50",
  is_legal: true,
  illegal_items: [],
  state_name: "New York",
  state_code: "NY",
  tax_breakdown: [{ cannabinoid_type: "general", rate: "8.875", special_tax_rate: "0", tax_amount: "1.50" }],
  tracking: { name: "x" },
};

export function recorder(responder?: Responder) {
  const calls: RecordedCall[] = [];
  const fetchMock = vi.fn(async (url: any, init: any = {}) => {
    let body: any = undefined;
    if (typeof init.body === "string") {
      try {
        body = JSON.parse(init.body);
      } catch {
        body = init.body;
      }
    }
    calls.push({ method: String(init.method || "GET").toUpperCase(), url: String(url), headers: normalizeHeaders(init.headers), body });
    const r = responder ? responder(String(url), init) : { body: UNIVERSAL };
    const text = r.text !== undefined ? r.text : JSON.stringify(r.body ?? UNIVERSAL);
    return new Response(text, {
      status: r.status ?? 200,
      headers: { "content-type": r.text !== undefined ? "text/html" : "application/json", ...(r.headers || {}) },
    });
  });
  return { calls, fetchMock };
}

/** Swap the global fetch for one call sequence. */
export async function withGlobalFetch<T>(fetchMock: any, fn: () => Promise<T>): Promise<T> {
  const original = globalThis.fetch;
  (globalThis as any).fetch = fetchMock;
  try {
    return await fn();
  } finally {
    (globalThis as any).fetch = original;
  }
}

export async function settle<T>(p: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false; error: { name: string; message: string; status?: number } }> {
  try {
    return { ok: true, value: await p() };
  } catch (e: any) {
    return { ok: false, error: { name: e?.name, message: e?.message, status: e?.status } };
  }
}
