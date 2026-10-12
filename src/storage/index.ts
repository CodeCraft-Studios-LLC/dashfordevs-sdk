/**
 * Storage utilities (dash4devs/storage)
 *
 *   import { storage, cookies, createStorage } from "dash4devs/storage";
 *   storage.set("cart_id", "cart_123");
 *   cookies.set("session", "abc123", { days: 7 });
 */

export { setCookie, getCookie, deleteCookie, getAllCookies, areCookiesEnabled } from "./cookies.js";
export type { CookieOptions } from "./cookies.js";

export { StorageManager, createStorage, storage, isLocalStorageAvailable, isSessionStorageAvailable } from "./storage.js";
export type { StorageType, StorageOptions } from "./storage.js";

import cookies from "./cookies.js";
export { cookies };
