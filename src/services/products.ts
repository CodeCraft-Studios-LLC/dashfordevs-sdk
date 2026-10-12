/**
 * Products Module
 *
 * Provides access to product listing and details from the storefront API.
 */

import type { DashClient } from "../client.js";
import type {
  AllReviewsResponse,
  FeaturedVariationsResponse,
  ProductCoreResponse,
  ProductFile,
  ProductGetResponse,
  ProductOptionsResponse,
  ProductReviewsResponse,
  ProductsListOptions,
  ProductsListResponse,
  SubmitReviewData,
  SubmitReviewResponse,
} from "../types.js";

export class ProductsModule {
  client: DashClient;

  constructor(client: DashClient) {
    this.client = client;
  }

  /**
   * List products with optional filters.
   * `category` may be comma-separated ("flower,deals") to match any of them.
   * `customFields` filter as cf_<key>=<value>.
   *
   * @example
   * const featured = await dash.products.list({ customFields: { featured: true }, include: ["main_size"], limit: 6 });
   */
  async list(options: ProductsListOptions & { q?: string } = {}): Promise<ProductsListResponse> {
    const params = new URLSearchParams();

    if (options.limit) params.append("limit", String(options.limit));
    if (options.offset) params.append("offset", String(options.offset));
    if (options.category) params.append("category", options.category);
    if (options.brand) params.append("brand", options.brand);
    if (options.search || options.q) params.append("search", (options.search || options.q) as string);

    // Include additional fields (e.g., main_size for pricing details)
    if (options.include && Array.isArray(options.include)) {
      params.append("include", options.include.join(","));
    }

    // Per-variation expansion control
    if (options.expand === false) params.append("expand", "false");

    // Custom fields filtering - prefix with cf_
    if (options.customFields && typeof options.customFields === "object") {
      for (const [key, value] of Object.entries(options.customFields)) {
        params.append(`cf_${key}`, String(value));
      }
    }

    const queryString = params.toString();
    const url = `${this.client.baseURL}/api/storefront/products${queryString ? `?${queryString}` : ""}`;

    return this.client._fetch(url);
  }

  /**
   * Get a single product by slug (full data — use getCore for SSR).
   * `options` are forwarded as query parameters (v1 declared this parameter
   * but dropped it; v2 sends it), e.g. `{ variation: "strain-a" }`.
   */
  async get(slug: string, options?: Record<string, string | number | boolean | undefined>): Promise<ProductGetResponse> {
    let qs = "";
    if (options && typeof options === "object") {
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(options)) {
        if (v !== undefined && v !== null && v !== "") params.append(k, String(v));
      }
      qs = params.toString();
    }
    const url = `${this.client.baseURL}/api/storefront/products/${encodeURIComponent(slug)}${qs ? `?${qs}` : ""}`;
    return this.client._fetch(url);
  }

  /** Lightweight core product data for SSR (no variations/sizes/bulk discounts). */
  async getCore(slug: string): Promise<ProductCoreResponse> {
    const url = `${this.client.baseURL}/api/storefront/products/${encodeURIComponent(slug)}/core`;
    return this.client._fetch(url);
  }

  /** Heavy options data (variations, sizes, bulk discounts, related, includes). */
  async getOptions(slug: string): Promise<ProductOptionsResponse> {
    const url = `${this.client.baseURL}/api/storefront/products/${encodeURIComponent(slug)}/options`;
    return this.client._fetch(url);
  }

  /** Reviews for a product. */
  async getReviews(slug: string, options: { limit?: number; offset?: number } = {}): Promise<ProductReviewsResponse> {
    const params = new URLSearchParams();
    if (options.limit) params.append("limit", String(options.limit));
    if (options.offset) params.append("offset", String(options.offset));

    const queryString = params.toString();
    const url = `${this.client.baseURL}/api/storefront/products/${encodeURIComponent(slug)}/reviews${queryString ? `?${queryString}` : ""}`;
    return this.client._fetch(url);
  }

  /** Submit a review for a product. */
  async submitReview(slug: string, data: SubmitReviewData): Promise<SubmitReviewResponse> {
    const url = `${this.client.baseURL}/api/storefront/products/${encodeURIComponent(slug)}/reviews`;
    return this.client._fetch(url, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  /** All approved reviews across all products. */
  async getAllReviews(
    options: {
      limit?: number;
      offset?: number;
      product?: string;
      rating?: number | string;
      sort?: "highest" | "lowest" | "newest" | "oldest" | string;
      has_media?: boolean | string;
    } = {}
  ): Promise<AllReviewsResponse> {
    const params = new URLSearchParams();
    if (options.limit) params.append("limit", String(options.limit));
    if (options.offset) params.append("offset", String(options.offset));
    if (options.product) params.append("product", options.product);
    if (options.rating) params.append("rating", String(options.rating));
    if (options.sort) params.append("sort", options.sort);
    if (options.has_media) params.append("has_media", String(options.has_media));
    const qs = params.toString();
    const url = `${this.client.baseURL}/api/storefront/reviews${qs ? `?${qs}` : ""}`;
    return this.client._fetch(url);
  }

  /** Featured variations (variations with show_in_bg custom field). */
  async getFeaturedVariations(): Promise<FeaturedVariationsResponse> {
    const url = `${this.client.baseURL}/api/storefront/featured-variations`;
    return this.client._fetch(url);
  }

  /**
   * The labelled file attachments for a product (sorted by `order`).
   * @example const coas = await dash.products.getFiles("thca-pre-rolls-classic", { label: "coa" });
   */
  async getFiles(slug: string, options: { label?: string } = {}): Promise<ProductFile[]> {
    const res: any = await this.get(slug);
    const files: ProductFile[] = (res && res.product && res.product.files) || [];
    if (options.label != null && options.label !== "") {
      return files.filter((f) => f.label === options.label);
    }
    return files;
  }

  /** A single file by label (lowest order wins), or null. */
  async getFile(slug: string, label: string): Promise<ProductFile | null> {
    const files = await this.getFiles(slug, { label });
    return files.length ? files[0] : null;
  }
}

export default ProductsModule;
