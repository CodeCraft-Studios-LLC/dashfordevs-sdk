/**
 * Unified storage manager over localStorage, sessionStorage, cookies or
 * memory, with automatic fallback. SSR-safe: on the server it uses memory.
 */

import { setCookie, getCookie, deleteCookie, areCookiesEnabled } from "./cookies.js";

export type StorageType = "local" | "session" | "cookie" | "auto";

export interface StorageOptions {
  type?: StorageType;
  prefix?: string;
  cookieDays?: number;
}

export function isLocalStorageAvailable(): boolean {
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

export function isSessionStorageAvailable(): boolean {
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

export class StorageManager {
  prefix: string;
  cookieDays: number;
  type: StorageType;
  _storage: string;
  _memoryStorage: Record<string, string>;

  constructor(options: StorageOptions = {}) {
    const { type = "auto", prefix = "dash4devs_", cookieDays = 30 } = options;

    this.prefix = prefix;
    this.cookieDays = cookieDays;
    this.type = type;
    this._memoryStorage = {};

    if (type === "auto") {
      if (isLocalStorageAvailable()) this._storage = "local";
      else if (areCookiesEnabled()) this._storage = "cookie";
      else this._storage = "memory";
    } else {
      this._storage = type;
      if (type === "cookie" && !areCookiesEnabled()) {
        if (typeof window !== "undefined") console.warn("Cookies not available, falling back to memory storage");
        this._storage = "memory";
      } else if (type === "local" && !isLocalStorageAvailable()) {
        if (typeof window !== "undefined") console.warn("localStorage not available, falling back to memory storage");
        this._storage = "memory";
      } else if (type === "session" && !isSessionStorageAvailable()) {
        this._storage = "memory";
      }
    }
  }

  _key(key: string): string {
    return `${this.prefix}${key}`;
  }

  set(key: string, value: any, options: { days?: number } = {}): void {
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
        setCookie(fullKey, serialized, { days: options.days || this.cookieDays, path: "/" });
        break;
      case "memory":
        this._memoryStorage[fullKey] = serialized;
        break;
    }
  }

  get<T = any>(key: string, defaultValue: T = null as unknown as T): T {
    const fullKey = this._key(key);
    let serialized: string | null | undefined;

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
      return serialized as unknown as T;
    }
  }

  remove(key: string): void {
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

  has(key: string): boolean {
    return this.get(key) !== null;
  }

  clear(): void {
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
        // Cookies cannot be enumerated by prefix reliably.
        break;
      case "memory":
        Object.keys(this._memoryStorage)
          .filter((k) => k.startsWith(this.prefix))
          .forEach((k) => delete this._memoryStorage[k]);
        break;
    }
  }

  getStorageType(): string {
    return this._storage;
  }
}

export function createStorage(options?: StorageOptions): StorageManager {
  return new StorageManager(options);
}

/** Default instance (as in v1). Marked pure so bundlers drop it when unused. */
export const storage: StorageManager = /*#__PURE__*/ new StorageManager();

export default StorageManager;
