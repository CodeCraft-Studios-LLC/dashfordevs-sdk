/**
 * Cookie management utilities (browser; no-ops on the server).
 */

export interface CookieOptions {
  days?: number;
  expires?: Date;
  path?: string;
  domain?: string;
  secure?: boolean;
  sameSite?: "Strict" | "Lax" | "None";
}

export function setCookie(name: string, value: string, options: CookieOptions = {}): void {
  if (typeof document === "undefined") return;

  const { days, expires, path = "/", domain, secure, sameSite = "Lax" } = options;

  let cookieString = `${encodeURIComponent(name)}=${encodeURIComponent(value)}`;

  if (expires) {
    cookieString += `; expires=${expires.toUTCString()}`;
  } else if (days) {
    const date = new Date();
    date.setTime(date.getTime() + days * 24 * 60 * 60 * 1000);
    cookieString += `; expires=${date.toUTCString()}`;
  }

  if (path) cookieString += `; path=${path}`;
  if (domain) cookieString += `; domain=${domain}`;
  if (secure) cookieString += "; secure";
  if (sameSite) cookieString += `; samesite=${sameSite}`;

  document.cookie = cookieString;
}

export function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;

  const nameEQ = encodeURIComponent(name) + "=";
  const cookies = document.cookie.split(";");

  for (let cookie of cookies) {
    cookie = cookie.trim();
    if (cookie.indexOf(nameEQ) === 0) {
      return decodeURIComponent(cookie.substring(nameEQ.length));
    }
  }

  return null;
}

export function deleteCookie(name: string, options: { path?: string; domain?: string } = {}): void {
  const { path = "/", domain } = options;
  setCookie(name, "", { expires: new Date(0), path, domain });
}

export function areCookiesEnabled(): boolean {
  if (typeof document === "undefined") return false;

  try {
    const testKey = "__dash4devs_cookie_test__";
    setCookie(testKey, "test");
    const result = getCookie(testKey) === "test";
    deleteCookie(testKey);
    return result;
  } catch {
    return false;
  }
}

export function getAllCookies(): Record<string, string> {
  if (typeof document === "undefined") return {};

  const cookies: Record<string, string> = {};
  const cookieString = document.cookie;

  if (!cookieString) return cookies;

  cookieString.split(";").forEach((cookie) => {
    const [name, ...valueParts] = cookie.trim().split("=");
    if (name) {
      cookies[decodeURIComponent(name)] = decodeURIComponent(valueParts.join("="));
    }
  });

  return cookies;
}

const cookies = {
  set: setCookie,
  get: getCookie,
  delete: deleteCookie,
  getAll: getAllCookies,
  areCookiesEnabled,
};

export default cookies;
