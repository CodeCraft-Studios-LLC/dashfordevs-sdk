/**
 * Upload Module
 *
 * File upload for contact-form attachments and review media.
 * Uses XMLHttpRequest in the browser for progress events (as v1); falls back
 * to fetch where XMLHttpRequest does not exist (server, workers).
 */

import type { DashClient } from "../client.js";
import { resolveFetch } from "../core/transport.js";

const ALLOWED_EXTENSIONS = new Set([
  // Images
  ".jpg", ".jpeg", ".png", ".gif", ".webp", ".avif", ".svg", ".bmp", ".ico", ".tiff", ".tif",
  // Documents
  ".pdf", ".txt", ".rtf",
  // Microsoft Office
  ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
  // OpenDocument
  ".odt", ".ods", ".odp",
  // Spreadsheets
  ".csv",
  // Archives
  ".zip", ".rar", ".7z",
  // Audio
  ".mp3", ".wav", ".ogg", ".flac", ".aac", ".m4a",
  // Video
  ".mp4", ".webm", ".mov", ".avi", ".mkv",
]);

const BLOCKED_EXTENSIONS = new Set([
  ".exe", ".bat", ".cmd", ".com", ".msi", ".dll", ".scr",
  ".py", ".pyc", ".pyw",
  ".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs",
  ".sh", ".bash", ".zsh", ".fish",
  ".php", ".phtml", ".php3", ".php4", ".php5", ".php7",
  ".rb", ".pl", ".pm",
  ".jar", ".class", ".java",
  ".vbs", ".vbe", ".wsf", ".wsh",
  ".ps1", ".psm1", ".psd1",
  ".asp", ".aspx",
  ".cgi",
  ".htm", ".html", ".xhtml",
]);

/** Result of `upload.isAllowed()` (v1 returned this object; its .d.ts said boolean). */
export interface UploadCheck {
  allowed: boolean;
  reason?: string;
}

export interface UploadResult {
  success: boolean;
  url: string;
  filename: string;
  size: number;
  [key: string]: any;
}

const MAX_SIZE = 25 * 1024 * 1024;

export class UploadModule {
  client: DashClient;

  constructor(client: DashClient) {
    this.client = client;
  }

  /** Whether a filename's extension may be uploaded. */
  isAllowed(filename: string): UploadCheck {
    const ext = "." + String(filename).split(".").pop()!.toLowerCase();

    if (BLOCKED_EXTENSIONS.has(ext)) {
      return { allowed: false, reason: `File type '${ext}' is not allowed for security reasons` };
    }

    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return { allowed: false, reason: `File type '${ext}' is not supported` };
    }

    return { allowed: true };
  }

  /** Upload one file (25 MB max). `onProgress(percent)` in the browser. */
  async file(file: File, options: { onProgress?: (percent: number) => void } = {}): Promise<UploadResult> {
    const validation = this.isAllowed(file.name);
    if (!validation.allowed) {
      throw new Error(validation.reason);
    }

    if (file.size > MAX_SIZE) {
      throw new Error("File size exceeds maximum of 25MB");
    }

    const url = `${this.client.baseURL}/api/storefront/upload`;
    const formData = new FormData();
    formData.append("file", file);

    if (typeof XMLHttpRequest === "undefined") {
      return this._uploadWithFetch(url, formData);
    }

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      xhr.upload.addEventListener("progress", (e) => {
        if (e.lengthComputable && options.onProgress) {
          const percent = Math.round((e.loaded / e.total) * 100);
          options.onProgress(percent);
        }
      });

      xhr.addEventListener("load", () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            resolve(JSON.parse(xhr.responseText));
          } catch {
            reject(new Error("Invalid response from server"));
          }
        } else {
          try {
            const error = JSON.parse(xhr.responseText);
            reject(new Error(error.message || "Upload failed"));
          } catch {
            reject(new Error("Upload failed"));
          }
        }
      });

      xhr.addEventListener("error", () => reject(new Error("Network error during upload")));
      xhr.addEventListener("abort", () => reject(new Error("Upload cancelled")));

      xhr.open("POST", url);
      xhr.setRequestHeader("X-API-Key", this.client.apiKey);
      xhr.send(formData);
    });
  }

  async _uploadWithFetch(url: string, formData: FormData): Promise<UploadResult> {
    const impl = resolveFetch(this.client._transport);
    let res: Response;
    try {
      res = await impl(url, { method: "POST", headers: { "X-API-Key": this.client.apiKey }, body: formData });
    } catch {
      throw new Error("Network error during upload");
    }
    const text = await res.text();
    let data: any = null;
    try {
      data = JSON.parse(text);
    } catch {
      /* handled below */
    }
    if (res.ok) {
      if (!data) throw new Error("Invalid response from server");
      return data;
    }
    throw new Error((data && data.message) || "Upload failed");
  }

  /** Upload several files in sequence; failures are reported per file, not thrown. */
  async files(
    files: ArrayLike<File> | Iterable<File>,
    options: {
      onFileProgress?: (index: number, percent: number) => void;
      onOverallProgress?: (percent: number) => void;
    } = {}
  ): Promise<Array<UploadResult | { success: false; error: string; filename: string }>> {
    const results: Array<UploadResult | { success: false; error: string; filename: string }> = [];
    const fileArray = Array.from(files as ArrayLike<File>);

    for (let i = 0; i < fileArray.length; i++) {
      const file = fileArray[i];
      try {
        const result = await this.file(file, {
          onProgress: (percent) => {
            if (options.onFileProgress) options.onFileProgress(i, percent);
            if (options.onOverallProgress) {
              options.onOverallProgress(Math.round(((i + percent / 100) / fileArray.length) * 100));
            }
          },
        });
        results.push(result);
      } catch (error: any) {
        results.push({ success: false, error: error.message, filename: file.name });
      }
    }

    return results;
  }

  getAllowedExtensions(): string[] {
    return Array.from(ALLOWED_EXTENSIONS);
  }

  getBlockedExtensions(): string[] {
    return Array.from(BLOCKED_EXTENSIONS);
  }
}

export default UploadModule;
