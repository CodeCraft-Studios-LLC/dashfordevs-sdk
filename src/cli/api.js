/**
 * Thin fetch wrapper for api.dashfordevs.com.
 *
 * Every request is authenticated with the X-API-Key header. Errors surface as
 * Error("<status>: <message>") so the calling command can decide how to
 * present them.
 */

export function createApi({ apiUrl, apiKey }) {
  async function request(method, path, body) {
    const res = await fetch(`${apiUrl}${path}`, {
      method,
      headers: {
        "X-API-Key": apiKey,
        "Content-Type": "application/json",
        "User-Agent": "dash4devs-cli",
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    let json = null;
    try { json = await res.json(); } catch { /* non-JSON ok */ }

    if (!res.ok) {
      const msg = (json && (json.message || json.error)) || res.statusText;
      const err = new Error(`${res.status}: ${msg}`);
      err.status = res.status;
      err.body = json;
      throw err;
    }
    return json;
  }

  return {
    manifest: (payload) => request("POST", "/api/v1/cdn/manifest", payload),
    confirmUpload: (sha256) => request("POST", "/api/v1/cdn/uploaded", { sha256 }),
    activate: (deploy_id) => request("POST", "/api/v1/cdn/activate", { deploy_id }),
    purge: (paths) => request("POST", "/api/v1/cdn/purge", { paths }),
    status: () => request("GET", "/api/v1/cdn/status"),
    generateImageVariants: () => request("POST", "/api/storefront/admin/media/generate-variants"),
    videoPrepare: (key, heights) =>
      request("POST", "/api/storefront/admin/media/video-prepare", { key, heights }),
    videoComplete: (payload) =>
      request("POST", "/api/storefront/admin/media/video-complete", payload),
  };
}
