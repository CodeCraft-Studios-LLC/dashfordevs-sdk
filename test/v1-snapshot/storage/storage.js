/**
 * Unified Storage Manager
 *
 * Provides a unified API for storing data that works across
 * localStorage, sessionStorage, and cookies with automatic fallback.
 */

import { setCookie, getCookie, deleteCookie, areCookiesEnabled } from "./cookies.js";

/**
 * @typedef {'local'|'session'|'cookie'|'auto'} StorageType
 */

/**
 * @typedef {Object} StorageOptions
 * @property {StorageType} [type='auto'] - Storage type to use
 * @property {string} [prefix='dash4devs_'] - Key prefix
 * @property {number} [cookieDays=30] - Default cookie expiration days
 */

/**
 * Check if localStorage is available
 * @returns {boolean}
 */
export function isLocalStorageAvailable() {
  if (typeof window === "undefined") return false;

  try {
    const testKey = "__dash4devs_ls_test__";
    window.localStorage.setItem(testKey, "test");
    window.localStorage.removeItem(testKey);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if sessionStorage is available
 * @returns {boolean}
 */
export function isSessionStorageAvailable() {
  if (typeof window === "undefined") return false;

  try {
    const testKey = "__dash4devs_ss_test__";
    window.sessionStorage.setItem(testKey, "test");
    window.sessionStorage.removeItem(testKey);
    return true;
  } catch {
    return false;
  }
}

/**
 * Storage Manager Class
 *
 * Provides a unified API for storing data with automatic type detection.
 */
export class StorageManager {
  /**
   * Create a storage manager instance
   * @param {StorageOptions} [options]
   */
  constructor(options = {}) {
    const { type = "auto", prefix = "dash4devs_", cookieDays = 30 } = options;

    this.prefix = prefix;
    this.cookieDays = cookieDays;
    this.type = type;

    // Determine best available storage
    if (type === "auto") {
      if (isLocalStorageAvailable()) {
        this._storage = "local";
      } else if (areCookiesEnabled()) {
        this._storage = "cookie";
      } else {
        this._storage = "memory";
        this._memoryStorage = {};
      }
    } else {
      this._storage = type;
      if (type === "cookie" && !areCookiesEnabled()) {
        console.warn("Cookies not available, falling back to memory storage");
        this._storage = "memory";
        this._memoryStorage = {};
      } else if (type === "local" && !isLocalStorageAvailable()) {
        console.warn("localStorage not available, falling back to memory storage");
        this._storage = "memory";
        this._memoryStorage = {};
      }
    }
  }

  /**
   * Get the full key with prefix
   * @private
   */
  _key(key) {
    return `${this.prefix}${key}`;
  }

  /**
   * Set a value
   * @param {string} key - Storage key
   * @param {any} value - Value to store (will be JSON serialized)
   * @param {Object} [options] - Additional options
   * @param {number} [options.days] - Cookie expiration days (for cookie storage)
   */
  set(key, value, options = {}) {
    const fullKey = this._key(key);
    const serialized = JSON.stringify(value);

    switch (this._storage) {
      case "local":
        window.localStorage.setItem(fullKey, serialized);
        break;
      case "session":
        window.sessionStorage.setItem(fullKey, serialized);
        break;
      case "cookie":
        setCookie(fullKey, serialized, {
          days: options.days || this.cookieDays,
          path: "/",
        });
        break;
      case "memory":
        this._memoryStorage[fullKey] = serialized;
        break;
    }
  }

  /**
   * Get a value
   * @param {string} key - Storage key
   * @param {any} [defaultValue=null] - Default value if not found
   * @returns {any} - Parsed value or default
   */
  get(key, defaultValue = null) {
    const fullKey = this._key(key);
    let serialized;

    switch (this._storage) {
      case "local":
        serialized = window.localStorage.getItem(fullKey);
        break;
      case "session":
        serialized = window.sessionStorage.getItem(fullKey);
        break;
      case "cookie":
        serialized = getCookie(fullKey);
        break;
      case "memory":
        serialized = this._memoryStorage[fullKey];
        break;
    }

    if (serialized === null || serialized === undefined) {
      return defaultValue;
    }

    try {
      return JSON.parse(serialized);
    } catch {
      return serialized;
    }
  }

  /**
   * Remove a value
   * @param {string} key - Storage key
   */
  remove(key) {
    const fullKey = this._key(key);

    switch (this._storage) {
      case "local":
        window.localStorage.removeItem(fullKey);
        break;
      case "session":
        window.sessionStorage.removeItem(fullKey);
        break;
      case "cookie":
        deleteCookie(fullKey, { path: "/" });
        break;
      case "memory":
        delete this._memoryStorage[fullKey];
        break;
    }
  }

  /**
   * Check if a key exists
   * @param {string} key - Storage key
   * @returns {boolean}
   */
  has(key) {
    return this.get(key) !== null;
  }

  /**
   * Clear all items with this manager's prefix
   */
  clear() {
    switch (this._storage) {
      case "local":
        Object.keys(window.localStorage)
          .filter((k) => k.startsWith(this.prefix))
          .forEach((k) => window.localStorage.removeItem(k));
        break;
      case "session":
        Object.keys(window.sessionStorage)
          .filter((k) => k.startsWith(this.prefix))
          .forEach((k) => window.sessionStorage.removeItem(k));
        break;
      case "cookie":
        // Can't easily enumerate cookies with a prefix, so this is limited
        break;
      case "memory":
        Object.keys(this._memoryStorage)
          .filter((k) => k.startsWith(this.prefix))
          .forEach((k) => delete this._memoryStorage[k]);
        break;
    }
  }

  /**
   * Get the current storage type
   * @returns {string}
   */
  getStorageType() {
    return this._storage;
  }
}

/**
 * Create a storage manager instance with default options
 * @param {StorageOptions} [options]
 * @returns {StorageManager}
 */
export function createStorage(options) {
  return new StorageManager(options);
}

// Default instance
export const storage = new StorageManager();

export default StorageManager;
