// ============================================================================
// Cookie Utilities
// ============================================================================

export interface CookieOptions {
  days?: number;
  expires?: Date;
  path?: string;
  domain?: string;
  secure?: boolean;
  sameSite?: "Strict" | "Lax" | "None";
}

export function setCookie(name: string, value: string, options?: CookieOptions): void;
export function getCookie(name: string): string | null;
export function deleteCookie(name: string, options?: { path?: string; domain?: string }): void;
export function getAllCookies(): Record<string, string>;
export function areCookiesEnabled(): boolean;

export const cookies: {
  set: typeof setCookie;
  get: typeof getCookie;
  delete: typeof deleteCookie;
  getAll: typeof getAllCookies;
  areCookiesEnabled: typeof areCookiesEnabled;
};

// ============================================================================
// Storage Manager
// ============================================================================

export type StorageType = "local" | "session" | "cookie" | "auto";

export interface StorageOptions {
  type?: StorageType;
  prefix?: string;
  cookieDays?: number;
}

export class StorageManager {
  constructor(options?: StorageOptions);
  set(key: string, value: any, options?: { days?: number }): void;
  get<T = any>(key: string, defaultValue?: T): T;
  remove(key: string): void;
  has(key: string): boolean;
  clear(): void;
  getStorageType(): string;
}

export function createStorage(options?: StorageOptions): StorageManager;
export function isLocalStorageAvailable(): boolean;
export function isSessionStorageAvailable(): boolean;

export const storage: StorageManager;
