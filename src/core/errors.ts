/**
 * One error type for everything the API (or the network) can do wrong.
 *
 * Compatible with v1: v1 threw a plain Error with `.status` and `.details`
 * (the parsed body) and a message taken from `body.message || body.error`.
 * DashApiError is still an Error with the same three, plus a stable `code`,
 * the request method and path (never the query string, which can carry
 * identifiers), and whether a retry could help.
 */

export type DashErrorCode =
  | "network_error"
  | "timeout"
  | "aborted"
  | "invalid_response"
  | string;

export interface DashApiErrorInit {
  message: string;
  status: number;
  code: DashErrorCode;
  details?: any;
  method?: string;
  url?: string;
  requestId?: string | null;
  retryable?: boolean;
  cause?: unknown;
}

/** Strip the query string and fragment: they can carry customer identifiers. */
export function pathOnly(url: string | undefined): string {
  if (!url) return "";
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname}`;
  } catch {
    return String(url).split(/[?#]/)[0];
  }
}

export class DashApiError extends Error {
  /** HTTP status; 0 when no response arrived (network error, timeout, abort). */
  readonly status: number;
  /** `body.error` from the API when present, else one of the SDK codes. */
  readonly code: DashErrorCode;
  /** The parsed response body (v1's `error.details`). `{}` when there was none. */
  readonly details: any;
  /** Per-field validation reasons from a 422 (`details.fields`), for forms and surveys. */
  readonly fields?: Record<string, string>;
  readonly method: string;
  /** Request URL without query string or fragment. */
  readonly url: string;
  /** `X-Request-Id` from the response, when the API sent one. */
  readonly requestId: string | null;
  /** Whether repeating the same request could succeed (5xx gateway errors, 429, timeouts). */
  readonly retryable: boolean;

  constructor(init: DashApiErrorInit) {
    super(init.message);
    this.name = "DashApiError";
    this.status = init.status;
    this.code = init.code;
    this.details = init.details ?? {};
    this.method = (init.method || "GET").toUpperCase();
    this.url = pathOnly(init.url);
    this.requestId = init.requestId ?? null;
    this.retryable = init.retryable ?? false;
    const fields = this.details && typeof this.details === "object" ? this.details.fields : undefined;
    if (fields && typeof fields === "object") this.fields = fields;
    if (init.cause !== undefined) {
      try {
        Object.defineProperty(this, "cause", { value: init.cause, enumerable: false, configurable: true });
      } catch {
        /* older runtimes */
      }
    }
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export function isDashApiError(err: unknown): err is DashApiError {
  return err instanceof DashApiError || (!!err && typeof err === "object" && (err as any).name === "DashApiError");
}
