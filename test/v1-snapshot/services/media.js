/**
 * Media Module
 *
 * Provides access to media files from the storefront API.
 */

export class MediaModule {
  constructor(client) {
    this.client = client;
  }

  /**
   * Get all media files within a named folder
   * @param {string} folderName - The folder name (e.g. "gallery_01")
   * @param {Object} [options] - Optional filters
   * @param {Object} [options.metadata] - Filter by metadata key-value pair (e.g. { type: "hero" })
   * @returns {Promise<{folder: string, items: Array}>}
   *
   * @example
   * const { items } = await client.media.getFolder("gallery_01");
   * console.log(items); // [{ id, name, url, alt_text, width, height, metadata, ... }, ...]
   *
   * // Filter by metadata
   * const heroes = await client.media.getFolder("gallery_01", { metadata: { type: "hero" } });
   */
  async getFolder(folderName, options) {
    let url = `${this.client.baseURL}/api/storefront/media/folder/${encodeURIComponent(folderName)}`;
    const params = new URLSearchParams();
    if (options?.metadata) {
      const entries = Object.entries(options.metadata);
      if (entries.length > 0) {
        params.set('metadata_key', entries[0][0]);
        params.set('metadata_value', String(entries[0][1]));
      }
    }
    const qs = params.toString();
    if (qs) url += `?${qs}`;
    return this.client._fetch(url);
  }

  /**
   * Get a single media file by its name field
   * @param {string} name - The exact name of the media file (e.g. "brick_desktop")
   * @returns {Promise<{file: {id, name, url, alt_text, width, height}}>}
   *
   * @example
   * const { file } = await client.media.getByName("brick_desktop");
   * console.log(file.url); // "https://cdn.example.com/media/brick_desktop.jpg"
   */
  async getByName(name) {
    const url = `${this.client.baseURL}/api/storefront/media/by-name/${encodeURIComponent(name)}`;
    return this.client._fetch(url);
  }
}

export default MediaModule;
