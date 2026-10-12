/**
 * Small read-mostly content modules: pages, SEO, brands, blog, sitemap, legal,
 * media, HTML templates, COA, contact. Each mirrors its v1 file exactly; they
 * share a file here only because each is a handful of lines.
 */

import type { DashClient } from "../client.js";
import type {
  BlogCategoriesListResponse,
  BlogPostGetOptions,
  BlogPostGetResponse,
  BlogPostSeoResponse,
  BlogPostsListOptions,
  BlogPostsListResponse,
  BrandDetailResponse,
  BrandGetOptions,
  BrandsListResponse,
  CoaDetailResponse,
  CoaListResponse,
  CoaProductResponse,
  HtmlTemplate,
  LegalDocumentResponse,
  LegalDocumentsListResponse,
  MediaByNameResponse,
  MediaFolderResponse,
  MediaGetFolderOptions,
  PageDataResponse,
  PagesListResponse,
  ProductSEO,
} from "../types.js";

// =============================================================================
// Pages
// =============================================================================

export class PagesModule {
  client: DashClient;
  constructor(client: DashClient) {
    this.client = client;
  }

  /** All configured pages. */
  async list(): Promise<PagesListResponse> {
    const url = `${this.client.baseURL}/api/storefront/pages`;
    return this.client._fetch(url);
  }

  /** Page data by path, with dynamic route matching ("/products/<slug>"). */
  async getByPath(path: string): Promise<PageDataResponse> {
    const url = `${this.client.baseURL}/api/storefront/page?path=${encodeURIComponent(path)}`;
    return this.client._fetch(url);
  }

  /** Page data by page name ("home"). */
  async getByName(name: string): Promise<PageDataResponse> {
    const url = `${this.client.baseURL}/api/storefront/page?name=${encodeURIComponent(name)}`;
    return this.client._fetch(url);
  }
}

// =============================================================================
// SEO
// =============================================================================

export class SeoModule {
  client: DashClient;
  constructor(client: DashClient) {
    this.client = client;
  }

  /** SEO metadata for a product. */
  async product(slug: string): Promise<{ seo: ProductSEO & { canonical_slug: string } }> {
    const url = `${this.client.baseURL}/api/storefront/seo/product/${encodeURIComponent(slug)}`;
    return this.client._fetch(url);
  }

  /** SEO metadata for a blog post. */
  async blogPost(slug: string): Promise<BlogPostSeoResponse> {
    const url = `${this.client.baseURL}/api/storefront/seo/blog/${encodeURIComponent(slug)}`;
    return this.client._fetch(url);
  }
}

// =============================================================================
// Brands
// =============================================================================

export class BrandsModule {
  client: DashClient;
  constructor(client: DashClient) {
    this.client = client;
  }

  /** All active brands. */
  async list(): Promise<BrandsListResponse> {
    const url = `${this.client.baseURL}/api/storefront/brands`;
    return this.client._fetch(url);
  }

  /** One brand with its products. */
  async get(slug: string, options: BrandGetOptions = {}): Promise<BrandDetailResponse> {
    const params = new URLSearchParams();
    if (options.limit) params.append("limit", String(options.limit));
    if (options.offset) params.append("offset", String(options.offset));

    const queryString = params.toString();
    const url = `${this.client.baseURL}/api/storefront/brands/${encodeURIComponent(slug)}${queryString ? `?${queryString}` : ""}`;
    return this.client._fetch(url);
  }
}

// =============================================================================
// Blog
// =============================================================================

export class BlogModule {
  client: DashClient;
  constructor(client: DashClient) {
    this.client = client;
  }

  /** Published posts (limit, offset or page, category, tag, search, featured, customFields). */
  async list(options: BlogPostsListOptions & { page?: number } = {}): Promise<BlogPostsListResponse> {
    const params = new URLSearchParams();

    const limit = options.limit || 20;
    if (options.limit) params.append("limit", String(options.limit));
    if (options.page && options.page > 1) {
      params.append("offset", String((options.page - 1) * limit));
    } else if (options.offset) {
      params.append("offset", String(options.offset));
    }
    if (options.category) params.append("category", options.category);
    if (options.tag) params.append("tag", options.tag);
    if (options.search) params.append("search", options.search);
    if (options.featured) params.append("featured", "true");

    if (options.customFields && typeof options.customFields === "object") {
      for (const [key, value] of Object.entries(options.customFields)) {
        params.append(`cf_${key}`, String(value));
      }
    }

    const queryString = params.toString();
    const url = `${this.client.baseURL}/api/storefront/blog/posts${queryString ? `?${queryString}` : ""}`;

    return this.client._fetch(url);
  }

  /** One post with full content. trackViews: "session" (default) | "always" | "none". */
  async get(slug: string, options: BlogPostGetOptions = {}): Promise<BlogPostGetResponse> {
    const params = new URLSearchParams();

    if (options.trackViews) params.append("track_views", options.trackViews);

    const queryString = params.toString();
    const url = `${this.client.baseURL}/api/storefront/blog/posts/${encodeURIComponent(slug)}${queryString ? `?${queryString}` : ""}`;
    return this.client._fetch(url);
  }

  /** SEO metadata for a post. */
  async getSeo(slug: string): Promise<BlogPostSeoResponse> {
    const url = `${this.client.baseURL}/api/storefront/seo/blog/${encodeURIComponent(slug)}`;
    return this.client._fetch(url);
  }

  /** Active blog categories. */
  async listCategories(): Promise<BlogCategoriesListResponse> {
    const url = `${this.client.baseURL}/api/storefront/blog/categories`;
    return this.client._fetch(url);
  }

  /**
   * Alias of `listCategories()`. v1's types declared it but the runtime did
   * not have it, so storefronts calling it threw; v2 implements it.
   */
  async categories(): Promise<BlogCategoriesListResponse> {
    return this.listCategories();
  }
}

// =============================================================================
// Sitemap
// =============================================================================

export class SitemapModule {
  client: DashClient;
  constructor(client: DashClient) {
    this.client = client;
  }

  /** Slug + updated_at for products, categories, brands and blogs. */
  async get(): Promise<{
    products: Array<{ slug: string; updated_at: string }>;
    categories: Array<{ slug: string; updated_at: string }>;
    brands: Array<{ slug: string; updated_at: string }>;
    blogs: Array<{ slug: string; updated_at: string }>;
    [key: string]: any;
  }> {
    const url = `${this.client.baseURL}/api/storefront/sitemap`;
    return this.client._fetch(url);
  }
}

// =============================================================================
// Legal
// =============================================================================

export class LegalModule {
  client: DashClient;
  constructor(client: DashClient) {
    this.client = client;
  }

  /** Published legal documents (title, slug, updated_at). */
  async list(): Promise<LegalDocumentsListResponse> {
    const url = `${this.client.baseURL}/api/storefront/legal`;
    return this.client._fetch(url);
  }

  /** One legal document with content. */
  async get(slug: string): Promise<LegalDocumentResponse> {
    const url = `${this.client.baseURL}/api/storefront/legal/${encodeURIComponent(slug)}`;
    return this.client._fetch(url);
  }
}

// =============================================================================
// Media
// =============================================================================

export class MediaModule {
  client: DashClient;
  constructor(client: DashClient) {
    this.client = client;
  }

  /** Every media file in a named folder; optionally one metadata key/value filter. */
  async getFolder(folderName: string, options?: MediaGetFolderOptions): Promise<MediaFolderResponse> {
    let url = `${this.client.baseURL}/api/storefront/media/folder/${encodeURIComponent(folderName)}`;
    const params = new URLSearchParams();
    if (options?.metadata) {
      const entries = Object.entries(options.metadata);
      if (entries.length > 0) {
        params.set("metadata_key", entries[0][0]);
        params.set("metadata_value", String(entries[0][1]));
      }
    }
    const qs = params.toString();
    if (qs) url += `?${qs}`;
    return this.client._fetch(url);
  }

  /** One media file by its name field. */
  async getByName(name: string): Promise<MediaByNameResponse> {
    const url = `${this.client.baseURL}/api/storefront/media/by-name/${encodeURIComponent(name)}`;
    return this.client._fetch(url);
  }
}

// =============================================================================
// HTML templates
// =============================================================================

export class HtmlTemplatesModule {
  client: DashClient;
  constructor(client: DashClient) {
    this.client = client;
  }

  /** An HTML template by id or slug. Inactive templates return 404. */
  async get(idOrSlug: string): Promise<{ template: HtmlTemplate }> {
    const url = `${this.client.baseURL}/api/storefront/html-templates/${encodeURIComponent(idOrSlug)}`;
    return this.client._fetch(url);
  }
}

// =============================================================================
// COA (lab reports)
// =============================================================================

export class CoaModule {
  client: DashClient;
  constructor(client: DashClient) {
    this.client = client;
  }

  /** Products with at least one lab-report file. */
  async list(options: { q?: string; includeVariations?: boolean } = {}): Promise<CoaListResponse> {
    const params = new URLSearchParams();
    if (options.q) params.append("q", options.q);
    if (options.includeVariations) params.append("include_variations", "true");

    const queryString = params.toString();
    const url = `${this.client.baseURL}/api/storefront/coa${queryString ? `?${queryString}` : ""}`;
    return this.client._fetch(url);
  }

  /** A product and its variations that have COA files. */
  async getProduct(productSlug: string): Promise<CoaProductResponse> {
    if (!productSlug) {
      throw new Error("productSlug is required");
    }
    const url = `${this.client.baseURL}/api/storefront/coa/${encodeURIComponent(productSlug)}`;
    return this.client._fetch(url);
  }

  /** One variation's COA detail. */
  async getVariation(productSlug: string, variationSlug: string): Promise<CoaDetailResponse> {
    if (!productSlug) {
      throw new Error("productSlug is required");
    }
    if (!variationSlug) {
      throw new Error("variationSlug is required");
    }
    const url = `${this.client.baseURL}/api/storefront/coa/${encodeURIComponent(productSlug)}/${encodeURIComponent(variationSlug)}`;
    return this.client._fetch(url);
  }
}

// =============================================================================
// Contact
// =============================================================================

export interface ContactSubmitData {
  name: string;
  email: string;
  content: string;
  phone?: string;
  subject?: string;
  files?: string[];
  source_url?: string;
  session_id?: string;
  cookies?: Record<string, string>;
  metadata?: Record<string, any>;
  turnstile_token?: string;
}

export class ContactModule {
  client: DashClient;
  constructor(client: DashClient) {
    this.client = client;
  }

  /** Submit a contact form (optionally with a Cloudflare Turnstile token). */
  async submit(data: ContactSubmitData): Promise<{ success: boolean; message: string; submission_id: string }> {
    const url = `${this.client.baseURL}/api/storefront/contact`;

    return this.client._fetch(url, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }
}
