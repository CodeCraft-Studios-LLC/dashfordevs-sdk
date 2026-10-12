/**
 * Upload Module
 *
 * Provides file upload functionality for contact form attachments.
 */

// Allowed file extensions
const ALLOWED_EXTENSIONS = new Set([
  // Images
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif', '.svg', '.bmp', '.ico', '.tiff', '.tif',
  // Documents
  '.pdf', '.txt', '.rtf',
  // Microsoft Office
  '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  // OpenDocument
  '.odt', '.ods', '.odp',
  // Spreadsheets
  '.csv',
  // Archives
  '.zip', '.rar', '.7z',
  // Audio
  '.mp3', '.wav', '.ogg', '.flac', '.aac', '.m4a',
  // Video
  '.mp4', '.webm', '.mov', '.avi', '.mkv',
]);

// Blocked extensions (executable/script files)
const BLOCKED_EXTENSIONS = new Set([
  '.exe', '.bat', '.cmd', '.com', '.msi', '.dll', '.scr',
  '.py', '.pyc', '.pyw',
  '.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs',
  '.sh', '.bash', '.zsh', '.fish',
  '.php', '.phtml', '.php3', '.php4', '.php5', '.php7',
  '.rb', '.pl', '.pm',
  '.jar', '.class', '.java',
  '.vbs', '.vbe', '.wsf', '.wsh',
  '.ps1', '.psm1', '.psd1',
  '.asp', '.aspx',
  '.cgi',
  '.htm', '.html', '.xhtml',
]);

export class UploadModule {
  constructor(client) {
    this.client = client;
  }

  /**
   * Check if a file extension is allowed
   * @param {string} filename - The filename to check
   * @returns {{allowed: boolean, reason?: string}}
   */
  isAllowed(filename) {
    const ext = '.' + filename.split('.').pop().toLowerCase();

    if (BLOCKED_EXTENSIONS.has(ext)) {
      return { allowed: false, reason: `File type '${ext}' is not allowed for security reasons` };
    }

    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return { allowed: false, reason: `File type '${ext}' is not supported` };
    }

    return { allowed: true };
  }

  /**
   * Upload a file
   * @param {File} file - The file to upload
   * @param {Object} [options] - Upload options
   * @param {function} [options.onProgress] - Progress callback (percent)
   * @returns {Promise<{success: boolean, url: string, filename: string, size: number}>}
   *
   * @example
   * const result = await dash.upload.file(file);
   * console.log(result.url); // URL of uploaded file
   */
  async file(file, options = {}) {
    // Validate file type
    const validation = this.isAllowed(file.name);
    if (!validation.allowed) {
      throw new Error(validation.reason);
    }

    // Validate file size (25MB max)
    const maxSize = 25 * 1024 * 1024;
    if (file.size > maxSize) {
      throw new Error('File size exceeds maximum of 25MB');
    }

    const url = `${this.client.baseURL}/api/storefront/upload`;
    const formData = new FormData();
    formData.append('file', file);

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable && options.onProgress) {
          const percent = Math.round((e.loaded / e.total) * 100);
          options.onProgress(percent);
        }
      });

      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const response = JSON.parse(xhr.responseText);
            resolve(response);
          } catch (e) {
            reject(new Error('Invalid response from server'));
          }
        } else {
          try {
            const error = JSON.parse(xhr.responseText);
            reject(new Error(error.message || 'Upload failed'));
          } catch (e) {
            reject(new Error('Upload failed'));
          }
        }
      });

      xhr.addEventListener('error', () => {
        reject(new Error('Network error during upload'));
      });

      xhr.addEventListener('abort', () => {
        reject(new Error('Upload cancelled'));
      });

      xhr.open('POST', url);
      xhr.setRequestHeader('X-API-Key', this.client.apiKey);
      xhr.send(formData);
    });
  }

  /**
   * Upload multiple files
   * @param {File[]} files - Array of files to upload
   * @param {Object} [options] - Upload options
   * @param {function} [options.onFileProgress] - Per-file progress callback (index, percent)
   * @param {function} [options.onOverallProgress] - Overall progress callback (percent)
   * @returns {Promise<Array<{success: boolean, url: string, filename: string, size: number}>>}
   *
   * @example
   * const results = await dash.upload.files(fileList, {
   *   onOverallProgress: (percent) => console.log(`${percent}% complete`)
   * });
   */
  async files(files, options = {}) {
    const results = [];
    const fileArray = Array.from(files);

    for (let i = 0; i < fileArray.length; i++) {
      const file = fileArray[i];

      try {
        const result = await this.file(file, {
          onProgress: (percent) => {
            if (options.onFileProgress) {
              options.onFileProgress(i, percent);
            }
            if (options.onOverallProgress) {
              const overallPercent = Math.round(((i + percent / 100) / fileArray.length) * 100);
              options.onOverallProgress(overallPercent);
            }
          }
        });
        results.push(result);
      } catch (error) {
        results.push({ success: false, error: error.message, filename: file.name });
      }
    }

    return results;
  }

  /**
   * Get list of allowed file extensions
   * @returns {string[]}
   */
  getAllowedExtensions() {
    return Array.from(ALLOWED_EXTENSIONS);
  }

  /**
   * Get list of blocked file extensions
   * @returns {string[]}
   */
  getBlockedExtensions() {
    return Array.from(BLOCKED_EXTENSIONS);
  }
}

export default UploadModule;
