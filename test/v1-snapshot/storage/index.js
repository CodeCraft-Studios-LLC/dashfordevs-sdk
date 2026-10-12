/**
 * Storage utilities for dash4devs
 *
 * Usage:
 * import { storage, cookies, createStorage } from "dash4devs/storage";
 *
 * // Using default storage manager
 * storage.set("cart_id", "cart_123");
 * const cartId = storage.get("cart_id");
 *
 * // Using cookies directly
 * cookies.set("session", "abc123", { days: 7 });
 * const session = cookies.get("session");
 *
 * // Creating a custom storage manager
 * const sessionStore = createStorage({ type: "session" });
 */

export {
  setCookie,
  getCookie,
  deleteCookie,
  getAllCookies,
  areCookiesEnabled,
} from "./cookies.js";

export {
  StorageManager,
  createStorage,
  storage,
  isLocalStorageAvailable,
  isSessionStorageAvailable,
} from "./storage.js";

// Convenience exports
import cookies from "./cookies.js";
export { cookies };
