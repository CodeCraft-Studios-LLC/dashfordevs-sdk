/**
 * Categories Module
 *
 * Category listing and details, with tree structure and depth filtering.
 */

import type { DashClient } from "../client.js";
import type {
  CategoriesListOptions,
  CategoriesListResponse,
  CategoryFile,
  CategoryGetOptions,
  CategoryGetResponse,
} from "../types.js";

export class CategoriesModule {
  client: DashClient;

  constructor(client: DashClient) {
    this.client = client;
  }

  /** List categories (tree, parent, depth, customFields filters). */
  async list(options: CategoriesListOptions = {}): Promise<CategoriesListResponse> {
    const params = new URLSearchParams();

    if (options.tree) params.append("tree", "true");
    if (options.parent) params.append("parent", options.parent);
    if (options.depth !== undefined) params.append("depth", String(options.depth));

    if (options.customFields && typeof options.customFields === "object") {
      for (const [key, value] of Object.entries(options.customFields)) {
        params.append(`cf_${key}`, String(value));
      }
    }

    const queryString = params.toString();
    const url = `${this.client.baseURL}/api/storefront/categories${queryString ? `?${queryString}` : ""}`;

    return this.client._fetch(url);
  }

  /**
   * A single category with its products (primary and additional members).
   * Build product URLs from `product.category`, which is each product's primary.
   */
  async get(
    slug: string,
    options: CategoryGetOptions & { includeChildren?: boolean } = {}
  ): Promise<CategoryGetResponse> {
    const params = new URLSearchParams();

    if (options.includeProducts === false) params.append("include_products", "false");
    if (options.includeChildren === false) params.append("include_children", "false");
    if (options.limit) params.append("limit", String(options.limit));
    if (options.offset) params.append("offset", String(options.offset));

    const queryString = params.toString();
    const url = `${this.client.baseURL}/api/storefront/categories/${encodeURIComponent(slug)}${queryString ? `?${queryString}` : ""}`;

    return this.client._fetch(url);
  }

  /** Categories at one depth (0 = root). */
  async getByDepth(depth = 0): Promise<CategoriesListResponse> {
    return this.list({ depth });
  }

  /** Full nested hierarchy. */
  async getTree(): Promise<CategoriesListResponse> {
    return this.list({ tree: true });
  }

  /** Children of a category. */
  async getChildren(parentSlug: string): Promise<CategoriesListResponse> {
    return this.list({ parent: parentSlug });
  }

  /** Labelled file attachments for a category (sorted by order). */
  async getFiles(slug: string, options: { label?: string } = {}): Promise<CategoryFile[]> {
    const res: any = await this.get(slug, { includeProducts: false, includeChildren: false });
    const files: CategoryFile[] = (res && res.category && res.category.files) || [];
    if (options.label != null && options.label !== "") {
      return files.filter((f) => f.label === options.label);
    }
    return files;
  }

  /** A single file by label (lowest order wins), or null. */
  async getFile(slug: string, label: string): Promise<CategoryFile | null> {
    const files = await this.getFiles(slug, { label });
    return files.length ? files[0] : null;
  }
}

export default CategoriesModule;
