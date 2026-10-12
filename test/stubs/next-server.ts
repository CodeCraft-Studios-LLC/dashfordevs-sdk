// Minimal stand-in for next/server used by createRevalidateHandler in tests.
export const NextResponse = {
  json(body: unknown, init: { status?: number } = {}) {
    return new Response(JSON.stringify(body), { status: init.status ?? 200, headers: { "content-type": "application/json" } });
  },
};
