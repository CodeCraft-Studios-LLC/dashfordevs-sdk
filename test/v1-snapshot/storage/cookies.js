/**
 * Cookie management utilities
 *
 * Provides a unified API for managing cookies in the browser
 * with support for common options like expiration, path, domain, etc.
 */

/**
 * @typedef {Object} CookieOptions
 * @property {number} [days] - Number of days until expiration
 * @property {Date} [expires] - Specific expiration date
 * @property {string} [path='/'] - Cookie path
 * @property {string} [domain] - Cookie domain
 * @property {boolean} [secure] - Only send over HTTPS
 * @property {'Strict'|'Lax'|'None'} [sameSite='Lax'] - SameSite policy
 */

/**
 * Set a cookie
 * @param {string} name - Cookie name
 * @param {string} value - Cookie value
 * @param {CookieOptions} [options] - Cookie options
 */
export function setCookie(name, value, options = {}) {
  if (typeof document === "undefined") return;

  const {
    days,
    expires,
    path = "/",
    domain,
    secure,
    sameSite = "Lax",
  } = options;

  let cookieString = `${encodeURIComponent(name)}=${encodeURIComponent(value)}`;

  // Expiration
  if (expires) {
    cookieString += `; expires=${expires.toUTCString()}`;
  } else if (days) {
    const date = new Date();
    date.setTime(date.getTime() + days * 24 * 60 * 60 * 1000);
    cookieString += `; expires=${date.toUTCString()}`;
  }

  // Path
  if (path) {
    cookieString += `; path=${path}`;
  }

  // Domain
  if (domain) {
    cookieString += `; domain=${domain}`;
  }

  // Secure
  if (secure) {
    cookieString += "; secure";
  }

  // SameSite
  if (sameSite) {
    cookieString += `; samesite=${sameSite}`;
  }

  document.cookie = cookieString;
}

/**
 * Get a cookie value
 * @param {string} name - Cookie name
 * @returns {string|null} - Cookie value or null if not found
 */
export function getCookie(name) {
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

/**
 * Delete a cookie
 * @param {string} name - Cookie name
 * @param {Object} [options] - Options (path and domain must match the original)
 * @param {string} [options.path='/'] - Cookie path
 * @param {string} [options.domain] - Cookie domain
 */
export function deleteCookie(name, options = {}) {
  const { path = "/", domain } = options;

  setCookie(name, "", {
    expires: new Date(0),
    path,
    domain,
  });
}

/**
 * Check if cookies are enabled
 * @returns {boolean}
 */
export function areCookiesEnabled() {
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

/**
 * Get all cookies as an object
 * @returns {Object<string, string>}
 */
export function getAllCookies() {
  if (typeof document === "undefined") return {};

  const cookies = {};
  const cookieString = document.cookie;

  if (!cookieString) return cookies;

  cookieString.split(";").forEach((cookie) => {
    const [name, ...valueParts] = cookie.trim().split("=");
    if (name) {
      cookies[decodeURIComponent(name)] = decodeURIComponent(
        valueParts.join("=")
      );
    }
  });

  return cookies;
}

export default {
  set: setCookie,
  get: getCookie,
  delete: deleteCookie,
  getAll: getAllCookies,
  areCookiesEnabled,
};
