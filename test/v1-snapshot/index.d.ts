/**
 * dash4devs - E-commerce SDK for developers
 * TypeScript definitions
 */

// =============================================================================
// TYPES
// =============================================================================

/**
 * Bulk discount tier for quantity-based pricing
 */
export interface BulkDiscount {
  /** Minimum quantity to trigger this discount tier */
  min_quantity: number;
  /** Maximum quantity for this tier (null = unlimited) */
  max_quantity: number | null;
  /** Type of discount */
  discount_type: "percentage" | "fixed";
  /** Discount value (e.g., "10" for 10% or $10 off) */
  discount_value: string;
}

/**
 * Product size/variant with pricing, stock, and bulk discounts
 */
export interface ProductSize {
  id: string;
  label: string;
  price: string;
  discounted_price: string | null;
  stock: number;
  in_stock: boolean;
  image: string | null;
  main: boolean;
  /** Weight value for bulk discount calculations (BamTHC style) */
  weight: string | null;
  /** Weight unit (g, oz, lb, etc.) */
  weight_unit: string;
  /** @deprecated Use tax_class instead. Cannabinoid classification for state-level tax calculation */
  cannabinoid_type: "general" | "cbd" | "delta8" | "delta9" | "thca" | "hhc" | string;
  /** Dynamic tax class slug (replaces cannabinoid_type) */
  tax_class?: string;
  /** Display name for the tax class */
  tax_class_name?: string;
  /** Loyalty points earned per unit purchased */
  points: number;
  /** Bulk discount tiers for this size */
  bulk_discounts?: BulkDiscount[];
  /**
   * Whether a per-customer custom price is active for this size.
   * Only present (and true) when the request was made with a customer JWT
   * and the backend has a custom price configured for that customer.
   * Absent on anonymous/guest responses.
   */
  has_custom_price?: boolean;
}

/**
 * Selectable variation for products with variations.
 * Each variation has its own sizes with pricing.
 */
export interface SelectableVariation {
  id: string;
  /** Display name (e.g., "Blue Razz", "Strawberry") */
  name: string;
  /** URL-friendly slug */
  slug: string;
  /** Rich HTML description */
  description: string | null;
  /** Variation image (typically from main size) */
  image: string | null;
  /** Whether this is the main/default variation */
  main: boolean;
  /** Total stock across all sizes */
  stock: number;
  /** Sizes available for this variation */
  sizes: ProductSize[];
}

/**
 * Product with full details for product page rendering
 */
export interface FreestyleSlotOption {
  id: string;
  product_name: string;
  short_name?: string;
  product_slug: string;
  image: string | null;
  variation_name: string | null;
  size_label: string | null;
  in_stock: boolean;
}

export interface FreestyleSlot {
  id: string;
  name: string;
  options: FreestyleSlotOption[];
}

/**
 * Bundle type for a product.
 * - "" — not a bundle
 * - "fixed" — preset list of included products
 * - "freestyle" — multiple named slots, customer fills each one
 * - "choose" — single mixed pool, customer picks N total from it
 */
export type BundleType = "" | "fixed" | "freestyle" | "choose";

export interface Product {
  id: string;
  name: string;
  slug: string;
  /** SEO-specific slug (may differ from `slug` for canonical URL management) */
  seo_slug?: string | null;
  main_image: string | null;
  /**
   * The product's PRIMARY category — the one its canonical URL and breadcrumb
   * are built from. A product can belong to several categories; use
   * `categories` for the full set, and keep using this one for links.
   */
  category: {
    id: string;
    name: string;
    slug: string;
    /** Parent category, present when this is a subcategory */
    parent?: { id: string; name: string; slug: string } | null;
  } | null;
  /**
   * Every category this product appears in — primary first, then any
   * additional ones. A product with a single category yields a one-item array,
   * so `product.categories[0]` and `product.category` agree.
   *
   * Build URLs from `category`, not from this: only the primary defines the
   * canonical path.
   */
  categories?: Array<{
    id: string;
    name: string;
    slug: string;
    parent?: { id: string; name: string; slug: string } | null;
  }>;
  price: string | null;
  discounted_price: string | null;
  in_stock: boolean;
  bundle_type?: BundleType;
  is_bundle?: boolean;
  /** Average review rating (0-5) */
  avg_rating?: number;
  /** Total number of approved reviews */
  reviews_count?: number;

  /**
   * Maximum bulk discount percentage available for this product.
   * Calculated from the highest discount tier across all sizes.
   * Useful for showing "Up to X% bulk discount" badges on product cards.
   */
  max_bulk_discount?: number | null;

  // Detail fields (only present when fetched with include_details)
  description?: string;

  /**
   * Whether this product has variations (auto-detected from active attribute options)
   */
  has_variations?: boolean;

  /**
   * Selectable variations with their own sizes and pricing
   */
  selectable_variations?: SelectableVariation[] | null;

  /**
   * Direct sizes (not linked to any variation)
   */
  sizes?: ProductSize[];

  /** Attributes (e.g., Color, Fabric) containing options with sizes */
  attributes?: ProductAttribute[];
  images?: { id: string; url: string }[];
  features?: { key: string; value: string }[];
  qna?: { question: string; answer: string }[];
  seo?: ProductSEO;

  /** Bundle includes for fixed bundles */
  includes?: any[] | null;
  /** Freestyle/Choose bundle slots (present for freestyle and choose bundles).
   *  A freestyle bundle has multiple named slots; a choose bundle has exactly
   *  one slot whose options span a mixed pool of products. */
  freestyle_slots?: FreestyleSlot[] | null;
  /** Labelled file attachments, sorted by `order`. Present on the product
   *  detail payload; fetch by label via products.getFile(slug, label). */
  files?: ProductFile[];
}

/**
 * Product SEO metadata
 */
export interface ProductSEO {
  title: string | null;
  description: string | null;
  keywords: string | null;
  og_image: string | null;
  schema: object | null;
}

export interface ProductAttribute {
  id: string;
  /** Attribute name (e.g., "Color", "Fabric", "Size Type") */
  name: string;
  /** Options for this attribute, each containing sizes with pricing */
  options: ProductAttributeOption[];
}

export interface ProductAttributeOption {
  id: string;
  /** Option value (e.g., "Black", "Cotton", "Standard") */
  value: string;
  slug: string;
  description: string;
  /** Whether this is the main/default option */
  main: boolean;
  /** Whether this option acts as its own product page */
  use_as_product_page: boolean;
  /** Open Graph image for this option */
  og_image: string | null;
  /** SEO title for this option's page */
  seo_title: string | null;
  /** SEO description for this option's page */
  seo_description: string | null;
  /** Sizes available for this option, with pricing and stock */
  sizes: ProductSize[];
}

export interface CategoryImage {
  id: string;
  image: string | null;
  alt_text: string | null;
  order: number;
}

/** A labelled file attached to a category (fetch via getFile/getFiles). */
export interface CategoryFile {
  id: string;
  /** Absolute URL to the file */
  url: string | null;
  /** Selector label (e.g. "menu", "coa") */
  label: string;
  /** Display name (defaults to the original filename) */
  name: string;
  order: number;
}

/**
 * A labelled file attached to a PRODUCT (fetch via products.getFile/getFiles).
 * Distinct from the per-variation files surfaced in `Product.lab_reports`:
 * these hang off the product, so a product with no variations can carry them.
 */
export interface ProductFile {
  id: string;
  /** Absolute URL to the file */
  url: string | null;
  /** Selector label (e.g. "coa", "manual") */
  label: string;
  /** Display name (defaults to the original filename) */
  name: string;
  order: number;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  description: string;
  /** Short description for card/list views */
  short_description?: string;
  /** Category cover image (for listings/home page) */
  image: string | null;
  /** Hero banner image (for category page hero section) */
  hero_image: string | null;
  parent_id: string | null;
  /** Short name for navigation menus (falls back to name if not set) */
  navbar_name: string | null;
  /** Caption text shown under navbar name in mega menus */
  navbar_caption: string | null;
  /** Whether this category appears on the home page */
  show_in_home: boolean;
  /** Flexible custom fields for filtering */
  custom_fields: Record<string, any>;
  // SEO fields
  seo_title: string | null;
  seo_description: string | null;
  seo_keywords: string | null;
  /** Open Graph image for social sharing */
  og_image: string | null;
  /** JSON-LD schema markup */
  schema_json: object | null;
  /** Gallery images for the category */
  images: CategoryImage[];
  /** Labelled file attachments (fetch a specific one via getFile) */
  files?: CategoryFile[];
  children?: Category[];
  products?: {
    items: Product[];
    pagination: Pagination;
  };
  /** FAQ items for this category (if configured) */
  faqs?: Array<{ question: string; answer: string }>;
}

export interface Pagination {
  total: number;
  limit: number;
  offset: number;
  has_more: boolean;
}

export interface CartItem {
  id?: string;
  product_id: string;
  product_name: string;
  product_slug?: string;
  /** Whether the underlying product is currently active in the store */
  product_active?: boolean;
  product_image: string | null;
  /** Category slug of the product */
  category_slug?: string | null;
  size_id: string;
  size_label: string;
  quantity: number;
  unit_price: string;
  total_price: string;
  /**
   * Set when this line starts a recurring order rather than shipping once.
   * Null on a normal purchase.
   */
  subscription?: {
    plan_id: string;
    subscription_id: string;
    interval_length: number;
    interval_unit: string;
    /** "Every 4 weeks". */
    label: string;
    discount_percent: string;
  } | null;
  is_subscription?: boolean;
  /** True when this line was added from a checkout upsell offer. */
  is_upsell?: boolean;
  /** The offer's price before its discount. Null unless is_upsell. */
  upsell_original_price?: string | null;
  /** When the offer's countdown ends. Null unless is_upsell. */
  upsell_expires_at?: string | null;
  /** The UpsellProduct this line came from. Null unless is_upsell. */
  upsell_id?: string | null;
  /**
   * What this line could be changed to, for `changeItem`.
   *
   * Only present on subscription lines: a one-off is edited by going back
   * to the product page, and sending a whole grid for every line of every
   * cart would be weight almost nobody uses.
   *
   * `strength` is the attribute option (null on a product with no
   * attribute) and `pack` is the size label, so a drawer can render one
   * selector or two without parsing a combined string. A size with an
   * empty `plans` is a real destination: landing there makes the line a
   * one-off.
   */
  change_options?: {
    sizes: {
      size_id: string;
      label: string;
      strength: string | null;
      pack: string;
      price: string;
      in_stock: boolean;
      plans: {
        plan_id: string;
        interval_length: number;
        interval_unit: string;
        /** "Every 4 weeks". */
        label: string;
        discount_percent: string;
        price: string | null;
      }[];
    }[];
  } | null;
  cannabinoid_type: string;
  /** Dynamic tax class slug (replaces cannabinoid_type) */
  tax_class?: string;
  /** Variation slug if this item belongs to a variation */
  variation_slug?: string | null;
  /** Variation name if this item belongs to a variation */
  variation_name?: string | null;
  /** Variation type descriptor */
  variation_type?: string | null;
  /** Whether this cart item is active (may be false if product was deactivated) */
  is_active?: boolean;
  /** Discounted price per unit (if a discount applies) */
  discounted_price?: string | null;
  /** Size image URL for this cart item */
  size_image?: string | null;
  /** Available stock for this size */
  stock_available?: number | null;
}

// =============================================================================
// OPTIONS
// =============================================================================

export interface DashClientOptions {
  /** Your API key (pk_* for public, sk_* for secret) */
  apiKey: string;
  /** Backend URL (default: "http://localhost:8000") */
  baseURL?: string;
  /**
   * The browser console "Stop" warning against self-XSS, printed once per page
   * when the client is created in a browser (never on localhost). On by
   * default; `false` turns it off, an object overrides its text.
   */
  consoleWarning?: boolean | { title?: string; heading?: string; body?: string; color?: string; skipLocalhost?: boolean };
}

export interface ProductsListOptions {
  /** Number of products per page (default: 20, max: 100) */
  limit?: number;
  /** Pagination offset (default: 0) */
  offset?: number;
  /**
   * Filter by category slug. Comma-separate for several ("flower,deals"),
   * which returns products in ANY of them.
   *
   * Matches a product's primary category and any additional categories it was
   * assigned to, so a product listed under "deals" is returned here even when
   * its primary category is "flower".
   */
  category?: string;
  /** Filter by brand slug */
  brand?: string;
  /** Search in product name */
  search?: string;
  /** Filter by custom fields (e.g. {popular: true, homepage_section: "hero"}) */
  customFields?: Record<string, string | number | boolean>;
  /**
   * Related resources to inline in each product object, e.g.
   * `["variations"]`, which adds `selectable_variations`: every attribute
   * option with its sizes, their prices, bulk tiers and subscription cells.
   *
   * A bare list read returns `main_size` and nothing else, so a storefront
   * that renders a size or strength selector on a grid card needs this.
   * Served by the slim, prefetch-only serializer and cached per catalog view
   * on the backend.
   *
   * This was missing from the type while `products.list` had supported it
   * since the beginning, which made the whole listing variation payload
   * unreachable from TypeScript.
   */
  include?: string[];
  /**
   * Whether to expand per-variation products into one card each.
   *
   * A different axis from `include`, and a different query parameter:
   * `include` adds fields to a product's payload, `expand` changes how many
   * products come back. Defaults to true on the backend; pass false to get
   * one card per product.
   */
  expand?: boolean;
}

export interface ReviewMedia {
  id: string;
  file_url: string;
  file_type: "image" | "video";
}

export interface ProductReview {
  id: string;
  rating: number;
  title: string;
  body: string;
  author_name: string;
  verified_purchase: boolean;
  created_at: string;
  variation_name?: string;
  variation_slug?: string;
  product_name?: string;
  product_slug?: string;
  product_image?: string | null;
  media?: ReviewMedia[];
}

export interface ProductReviewsResponse {
  reviews: ProductReview[];
  stats: {
    count: number;
    average_rating: number;
    rating_breakdown: {
      1: number;
      2: number;
      3: number;
      4: number;
      5: number;
    };
  };
  pagination: {
    total: number;
    limit: number;
    offset: number;
    has_more: boolean;
  };
}

/** A "Notify Me When Back In Stock" request (inventory.RestockRequest). */
export interface RestockRequest {
  id: string;
  /** open: waiting; notified: the back-in-stock email went out; unsubscribed: stopped. */
  status: "open" | "notified" | "unsubscribed";
  product: { id: string; name: string; slug: string; category_slug: string | null; image: string | null };
  variation: string | null;
  size_id: string;
  size: string | null;
  in_stock: boolean;
  created_at: string;
  notified_at: string | null;
  unsubscribed_at: string | null;
}

export interface RestockRequestResponse {
  success: boolean;
  /** false when an open request already existed or the size is in stock. */
  created: boolean;
  /** The size is in stock: nothing was stored, add it to the cart instead. */
  in_stock: boolean;
  id?: string;
}

export interface SubmitReviewData {
  /** Rating from 1-5 (required) */
  rating: number;
  /** Reviewer name (required) */
  author_name: string;
  /** Reviewer email (optional) */
  author_email?: string;
  /** Review title (optional) */
  title?: string;
  /** Review content (optional) */
  body?: string;
  /** Variation slug (optional) */
  variation_slug?: string;
  /** Array of uploaded media URLs (optional) */
  media_urls?: string[];
  /** Whether to submit anonymously (hides author name on display) */
  is_anonymous?: boolean;
}

export interface AllReviewsResponse {
  reviews: ProductReview[];
  avg_rating: number;
  total: number;
  pagination: {
    total: number;
    limit: number;
    offset: number;
    has_more: boolean;
  };
}

export interface SubmitReviewResponse {
  review: ProductReview;
  message: string;
}

export interface CategoriesListOptions {
  /** If true, returns nested tree structure */
  tree?: boolean;
  /** Filter by parent category slug */
  parent?: string;
  /** Filter by depth level (0 = root, 1 = first level children, etc.) */
  depth?: number;
  /** Filter by custom fields (e.g. {show_in_mega_menu: true}) */
  customFields?: Record<string, string | number | boolean>;
}

export interface CategoryGetOptions {
  /** Include products in response (default: true) */
  includeProducts?: boolean;
  /** Number of products */
  limit?: number;
  /** Pagination offset */
  offset?: number;
}

export interface CartAddOptions {
  /** Product ID */
  productId: string;
  /** Size/variant ID */
  sizeId: string;
  /** Quantity (default: 1) */
  quantity?: number;
  /** Freestyle bundle selections (slot_id + option_id pairs) */
  freestyleSelections?: { slot_id: string; option_id: string }[];
  /**
   * Start a subscription instead of buying once. Read the id from
   * `size.subscription_plans` on the product payload; it already implies the
   * size and the cadence.
   */
  subscriptionPlanId?: string;
}

// =============================================================================
// RESPONSES
// =============================================================================

export interface PingResponse {
  status: string;
  message: string;
  organization: { id: string; name: string; is_locked: boolean };
  environment: string;
  timestamp: string;
}

export interface ProductsListResponse {
  products: Product[];
  pagination: Pagination;
}

export interface ProductGetResponse {
  product: Product;
}

/**
 * Response from the lightweight core product endpoint (/products/{slug}/core).
 * Contains SSR-friendly data without heavy variations/sizes/bulk discounts.
 */
export interface ProductCoreResponse {
  product: {
    id: string;
    name: string;
    short_name: string | null;
    slug: string;
    description: string | null;
    in_stock: boolean;
    main_image: string | null;
    display_image: string | null;
    avg_rating: number;
    reviews_count: number;
    /** Min/max effective price across all sizes */
    price_range: { min: string; max: string } | null;
    /** Primary category — the canonical URL and breadcrumb are built from it. */
    category: {
      id: string;
      name: string;
      slug: string;
      parent: { id: string; name: string; slug: string } | null;
    } | null;
    /** Every category this product appears in — primary first, then extras. */
    categories?: Array<{
      id: string;
      name: string;
      slug: string;
      parent?: { id: string; name: string; slug: string } | null;
    }>;
    features: { key: string; value: string }[];
    qna: { question: string; answer: string }[];
    images: { id: string; url: string }[];
    seo: {
      title: string | null;
      description: string | null;
      keywords: string | null;
      og_image: string | null;
    };
    bundle_type: BundleType | null;
    custom_fields: Record<string, any>;
  };
}

/**
 * Response from the heavy options endpoint (/products/{slug}/options).
 * Contains variations, sizes, bulk discounts, related products, and bundle data.
 * Intended for client-side fetching after SSR of core data.
 */
export interface ProductOptionsResponse {
  options: {
    has_variations: boolean;
    selectable_variations: SelectableVariation[] | null;
    lab_reports: {
      variation_name: string;
      variation_slug: string;
      file_name: string;
      url: string;
    }[] | null;
    sizes: ProductSize[];
    attributes: {
      id: string;
      name: string;
      options: {
        id: string;
        value: string;
        slug: string;
        description: string | null;
        main: boolean;
        use_as_product_page: boolean;
        og_image: string | null;
        seo_title: string | null;
        seo_description: string | null;
        sizes: ProductSize[];
      }[];
    }[];
    includes: any[] | null;
    freestyle_slots: FreestyleSlot[] | null;
    related: Product[];
    bundle_type: BundleType | null;
    is_bundle: boolean;
  };
}

export interface FeaturedVariation {
  id: string;
  /** Variation name (e.g. "Blue Razz") */
  name: string;
  /** Variation slug */
  slug: string;
  /** Variation's main size image URL */
  image: string | null;
  /** Parent product name */
  product_name: string;
  /** Parent product slug for linking */
  product_slug: string;
  /** Desktop: horizontal position % (0-100) */
  d_pos_x: number | null;
  /** Desktop: vertical position % (0-100) */
  d_pos_y: number | null;
  /** Desktop: scale multiplier (1 = default) */
  d_scale: number | null;
  /** Desktop: rotation in degrees */
  d_rot: number | null;
  /** Mobile: horizontal position % (0-100) */
  m_pos_x: number | null;
  /** Mobile: vertical position % (0-100) */
  m_pos_y: number | null;
  /** Mobile: scale multiplier (1 = default) */
  m_scale: number | null;
  /** Mobile: rotation in degrees */
  m_rot: number | null;
}

export interface FeaturedVariationsResponse {
  variations: FeaturedVariation[];
}

export interface CategoriesListResponse {
  categories: Category[];
}

export interface CategoryGetResponse {
  category: Category;
}

export interface CartAddResponse {
  cart_id: string;
  item: CartItem;
  message: string;
}

export interface CartGetResponse {
  cart_id: string | null;
  items: CartItem[];
  subtotal: string;
  item_count: number;
}

export interface CartUpdateResponse {
  cart_id: string;
  item?: CartItem;
  message: string;
}

export interface CartRemoveResponse {
  message: string;
  cart: CartGetResponse;
}

export interface CartClearResponse {
  message: string;
  cart: CartGetResponse;
}

export interface CartTotals {
  itemCount: number;
  subtotal: string;
}

// =============================================================================
// PAGE DATA TYPES
// =============================================================================

export interface PageInfo {
  name: string;
  path: string;
  title: string | null;
  description: string | null;
}

export interface GlobalData {
  /** Store name (from Organization or StorefrontConfig) */
  store_name: string | null;
  /** Store description */
  store_description: string | null;
  /** Logo URL (from StorefrontConfig) */
  logo_url?: string | null;
  /** Logo image (from Organization) */
  logo: string | null;
  /** Business contact email */
  business_email: string | null;
  /** Business phone number */
  business_phone: string | null;
  /** Business website URL */
  website: string | null;
  /** Business address */
  address: string | null;
  /** City */
  city: string | null;
  /** Postal/ZIP code */
  zip_code: string | null;
  /** State information */
  state: { id: string; name: string; code: string } | null;
  /** Business type */
  business_type: { id: string; name: string } | null;
  /** Industry classification */
  industry: { id: string; name: string } | null;

  // Storefront settings
  /** Minimum cart subtotal for free shipping (null = no free shipping) */
  min_for_free_shipping: string | null;
  /** Default shipping rate when below free shipping threshold */
  shipping_rate: string | null;
  /** Tax rate as percentage (e.g., "8.25" for 8.25%) */
  tax_rate: string | null;
  /** Currency code (ISO 4217, e.g., "USD") */
  currency: string;

  // Loyalty presentation
  /**
   * How a loyalty balance should be SHOWN to customers.
   *
   * The ledger is points either way: `Customer.points` is the unit of
   * record, earning is points per dollar on the product, and the
   * discount store is priced in points. This only decides whether a
   * storefront prints "1,250 points" or "$12.50".
   *
   * Branch on it rather than assuming. A storefront that hardcodes one
   * presentation goes wrong the day a merchant flips the switch.
   */
  loyalty_display_mode?: "points" | "cashback" | null;
  /**
   * Points equal to one unit of `currency`, e.g. 100 means 100 points
   * to the dollar.
   *
   * ONLY SENT IN CASHBACK MODE, and null otherwise, so a storefront
   * cannot quietly convert a balance the merchant asked to be shown as
   * points. Never divide by this without checking it: it is a divisor
   * and the API is entitled to send null.
   *
   * Prefer the server's own `cash_value` where one is offered. This is
   * for formatting copy such as "5 points per dollar", not for working
   * out what somebody's balance is worth.
   */
  points_per_currency_unit?: number | null;

  /** Additional global data sources (nav_categories, etc.) */
  [key: string]: any;
}

export interface GlobalDataResponse {
  global: GlobalData;
}

export interface PageDataResponse {
  page: PageInfo;
  params: Record<string, string>;
  global: GlobalData;
  data: Record<string, any>;
}

export interface PagesListResponse {
  pages: PageInfo[];
}

export interface GetPageDataOptions {
  /** If true, treats the first parameter as a page name instead of path */
  byName?: boolean;
}

// =============================================================================
// MODULES
// =============================================================================

declare class ProductsModule {
  /**
   * List products with optional filters
   */
  list(options?: ProductsListOptions): Promise<ProductsListResponse>;

  /**
   * Get a single product by slug (full data — use getCore for SSR)
   * @param slug - Product slug
   * @param options - Optional query params forwarded to the backend (e.g. { variation: "strain-a" })
   */
  get(slug: string, options?: Record<string, string | number | boolean | undefined>): Promise<ProductGetResponse>;

  /**
   * Get lightweight core product data for SSR.
   * No variations, sizes, or bulk discounts — fast TTFB.
   * @param slug - Product slug
   */
  getCore(slug: string): Promise<ProductCoreResponse>;

  /**
   * Get heavy options data (variations, sizes, bulk discounts, related, includes).
   * Intended for client-side fetching after SSR of core data.
   * @param slug - Product slug
   */
  getOptions(slug: string): Promise<ProductOptionsResponse>;

  /**
   * Get reviews for a product
   * @param slug - Product slug
   * @param options - Pagination options
   */
  getReviews(slug: string, options?: { limit?: number; offset?: number }): Promise<ProductReviewsResponse>;

  /**
   * Submit a review for a product
   * @param slug - Product slug
   * @param data - Review data
   */
  submitReview(slug: string, data: SubmitReviewData): Promise<SubmitReviewResponse>;

  /**
   * Get all approved reviews across all products
   */
  getAllReviews(options?: {
    limit?: number;
    offset?: number;
    product?: string;
    rating?: number | string;
    sort?: "highest" | "lowest" | "newest" | "oldest" | string;
    has_media?: boolean | string;
  }): Promise<AllReviewsResponse>;

  /**
   * Get featured variations (variations with show_in_bg custom field)
   */
  getFeaturedVariations(): Promise<FeaturedVariationsResponse>;

  /**
   * Get the labelled file attachments for a product, sorted by `order`.
   * @param slug - Product slug
   * @param options.label - Only return files with this exact label
   */
  getFiles(slug: string, options?: { label?: string }): Promise<ProductFile[]>;

  /**
   * Get a single file from a product by label (lowest order wins, else null).
   * @param slug - Product slug
   * @param label - The file label to select
   */
  getFile(slug: string, label: string): Promise<ProductFile | null>;
}

declare class CategoriesModule {
  /**
   * List categories
   */
  list(options?: CategoriesListOptions): Promise<CategoriesListResponse>;

  /**
   * Get a single category with its products
   */
  get(slug: string, options?: CategoryGetOptions): Promise<CategoryGetResponse>;

  /**
   * Get categories at a specific depth level
   * Convenience method for building navbars (depth 0) or submenus
   * @param depth - Depth level (0 = root categories)
   */
  getByDepth(depth?: number): Promise<CategoriesListResponse>;

  /**
   * Get category tree starting from root
   * Returns full nested hierarchy
   */
  getTree(): Promise<CategoriesListResponse>;

  /**
   * Get children of a specific category
   * @param parentSlug - Parent category slug
   */
  getChildren(parentSlug: string): Promise<CategoriesListResponse>;

  /**
   * Get the labelled file attachments for a category (sorted by order).
   * @param slug - Category slug
   * @param options.label - Only return files with this exact label
   */
  getFiles(slug: string, options?: { label?: string }): Promise<CategoryFile[]>;

  /**
   * Get a single file from a category by label (lowest order wins, else null).
   * @param slug - Category slug
   * @param label - The file label to select
   */
  getFile(slug: string, label: string): Promise<CategoryFile | null>;
}

// =============================================================================
// BRANDS MODULE
// =============================================================================

export interface Brand {
  id: string;
  name: string;
  slug: string;
  image: string | null;
}

export interface BrandsListResponse {
  brands: Brand[];
}

export interface BrandDetail {
  id: string;
  name: string;
  slug: string;
  image: string | null;
  description: string;
  short_description: string;
  seo_title: string;
  seo_description: string;
  seo_keywords: string;
  og_image: string | null;
  custom_fields: Record<string, any>;
}

export interface BrandDetailResponse {
  brand: BrandDetail;
  products: any[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    has_more: boolean;
  };
}

export interface BrandGetOptions {
  limit?: number;
  offset?: number;
}

declare class BrandsModule {
  /**
   * List all active brands
   */
  list(): Promise<BrandsListResponse>;

  /**
   * Get a single brand with its products
   */
  get(slug: string, options?: BrandGetOptions): Promise<BrandDetailResponse>;
}

export interface MarketingConfig {
  active: boolean;
  provider: { slug: string; name: string } | null;
  config?: Record<string, string>;
}

declare class MarketingModule {
  /**
   * Initialize marketing scripts (e.g. Klaviyo onsite JS).
   * Fetches email provider config and injects the appropriate script tag.
   * Safe to call multiple times — only runs once.
   */
  init(): Promise<MarketingConfig>;

  /**
   * Get the cached config (call init() first).
   */
  getConfig(): MarketingConfig | null;

  /**
   * Associate the anonymous browser with a known profile so onsite events
   * attach to it (powers browse-abandonment targeting). Needs { email }.
   */
  identify(profile: { email: string; first_name?: string; last_name?: string; phone?: string }): void;

  /** Push a custom onsite Klaviyo event (client-side, anonymous-safe). */
  trackOnsite(event: string, properties?: Record<string, any>): void;

  /**
   * Fire Klaviyo product-page web tracking ("Viewed Product" + trackViewedItem).
   * This is the onsite event Klaviyo's "set up product web tracking" wants;
   * call once per product detail view. Anonymous-safe.
   */
  viewedProduct(product: {
    id: string;
    name: string;
    url: string;
    imageUrl?: string;
    price?: number | string;
    compareAtPrice?: number | string;
    brand?: string;
    categories?: string[];
    sku?: string;
  }): void;
}

/**
 * The cards a signed-in customer has saved.
 *
 * Nothing here creates one: a card is saved during checkout by the
 * processor's own tokenizer, so card data never reaches this SDK. This
 * lists what is already there, removes one, or moves the default.
 *
 * `profile_id` is the processor's handle for the record, not an id of ours.
 * Every call needs a Bearer token, because a payment method belongs to a
 * person rather than to an organization.
 */
declare class PaymentMethodsModule {
  list(): Promise<{
    payment_methods: {
      profile_id: number
      card_type: string
      last_four: string
      expiry: string
      is_default: boolean
    }[]
  }>;
  /** Forget a card. The server decides whether a subscription blocks it. */
  remove(profileId: number | string): Promise<{ success?: boolean; message?: string }>;
  setDefault(profileId: number | string): Promise<{ success?: boolean; message?: string }>;
}

declare class CartModule {
  /** Current cart ID */
  readonly cartId: string | null;

  /** All items in the cart */
  readonly items: CartItem[];

  /**
   * Load an existing cart by ID
   * @param cartId - Cart ID to load
   */
  load(cartId: string): Promise<CartGetResponse>;

  /**
   * Add item to cart
   */
  add(options: CartAddOptions): Promise<CartAddResponse>;

  /**
   * Set the per-location quantity split for a multi-location wholesale order.
   * The server derives each line's quantity from the sum across locations.
   */
  setLocations(locations: Record<string, { label?: string; state?: string; items: Record<string, number> }>): Promise<CartState>;

  /**
   * Update item quantity in cart.
   *
   * A size id does not identify a line on its own once a cart can hold
   * subscriptions: the same size can sit in it once outright and again at
   * two cadences. Pass `{ itemId }` from the cart line to address one
   * exactly; without it only the one-off line for that size is reached.
   *
   * @param sizeId - Size ID of item to update, or null when using itemId
   * @param quantity - New quantity (0 to remove)
   */
  update(
    sizeId: string | null,
    quantity: number,
    options?: { itemId?: string }
  ): Promise<CartUpdateResponse>;

  /**
   * Move one cart line to a different size, cadence, or both.
   *
   * Distinct from `update`, which is quantity-by-size. This is "make this
   * line a different thing", for a cart drawer that edits a subscription in
   * place: strength, pack and frequency as dropdowns on the line somebody
   * is already looking at.
   *
   * An edit, not a remove and re-add, so the line keeps its id, its
   * position and its quantity, in one request rather than two.
   *
   * `sizeId` and `subscriptionPlanId` are independent; pass either or both.
   * Moving the size alone carries the cadence to the equivalent cell on the
   * new size. `subscriptionPlanId: ""` turns the line into a one-off.
   *
   * The dropdown options come from the line: a subscription line carries
   * `change_options.sizes`, each with `strength`, `pack` and its `plans`.
   */
  changeItem(
    itemId: string,
    changes?: {
      sizeId?: string
      subscriptionPlanId?: string
      quantity?: number
    }
  ): Promise<CartUpdateResponse>;

  /**
   * Get cart contents from server
   */
  get(): Promise<CartGetResponse>;

  /**
   * Remove item from cart. See `update` for why `itemId` exists.
   * @param sizeId - Size ID of item to remove, or null when using itemId
   */
  remove(
    sizeId: string | null,
    options?: { itemId?: string }
  ): Promise<CartRemoveResponse>;

  /**
   * Clear all items from cart
   */
  clear(): Promise<CartClearResponse>;

  /**
   * Get cart totals
   */
  getTotals(): CartTotals;

  /**
   * Get total quantity across all items
   */
  getTotalQuantity(): number;

  /**
   * Get upsell recommendations for the current cart
   */
  getUpsells(): Promise<{
    upsells: Array<{
      upsell_id: string; product_id: string; product_name: string; product_slug: string
      product_image: string | null; variation_id: string | null; variation_name: string | null
      size_id: string; size_label: string; original_price: string; upsell_price: string
      discount_type: "percentage" | "fixed"; discount_value: string; category_name: string | null
      /**
       * False = either/or: accepting this offer swaps out any other
       * non-accumulating offer already in the cart. True = it stacks.
       */
      accumulate: boolean
    }>
    timer_minutes: number; enabled: boolean
  }>;

  /**
   * Start an upsell session (creates server-side timer)
   */
  startUpsellSession(upsellIds: string[]): Promise<{
    session_id: string; expires_at: string; remaining_seconds: number; timer_minutes: number
  }>;

  /**
   * Check the status of the active upsell session
   */
  getUpsellStatus(): Promise<{
    active: boolean; session_id?: string; expires_at?: string; remaining_seconds: number
  }>;

  /**
   * Add an upsell product to the cart at the discounted price.
   * @param upsellId - UpsellProduct ID
   * @param sessionId - CheckoutUpsellSession ID
   * @param sizeId - Optional size override for "All variations" mode upsells
   */
  addUpsellToCart(upsellId: string, sessionId: string, sizeId?: string | null): Promise<{
    cart_id: string; item: CartItem; message: string
    /** upsell_ids of either/or offers this add removed from the cart. */
    replaced_upsell_ids: string[]
  }>;

  /**
   * Initialize the cart on app mount.
   *
   * Picks the right loading strategy based on auth state:
   *   - Authenticated user → loads the cart tied to the customer FK
   *     (model-based). If a guest `fallbackCartId` is also present, the
   *     guest cart is merged into the user's cart before returning.
   *   - Guest (no auth)    → restores the cart via `fallbackCartId`
   *     (typically persisted in localStorage).
   *   - Neither            → empty cart.
   *
   * Always returns the fully-hydrated cart state from the server.
   */
  init(fallbackCartId?: string | null): Promise<CartGetResponse>;

  /**
   * Load the authenticated user's cart from the backend by customer FK.
   * Works across devices/browsers. Requires an active access token on
   * the client's auth module.
   */
  loadUserCart(): Promise<CartGetResponse>;

  /**
   * Migrate a guest cart to the authenticated user's cart. Falls back to
   * `loadUserCart()` if there is no guest cart to migrate.
   */
  migrateToUser(): Promise<CartGetResponse>;

  /**
   * Reset cart state (used on logout).
   */
  reset(): void;

  /**
   * Apply a discount code to the cart.
   */
  /**
   * Remember what a guest typed into checkout, as they type it.
   *
   * Call on blur or debounced change, not on submit — the whole point is the
   * person who fills half the form and leaves. Nothing is validated, fields are
   * independent, and "" clears one field. A no-op once the cart is signed in.
   */
  setContact(contact: {
    email?: string;
    phone?: string;
    first_name?: string;
    last_name?: string;
  }): Promise<{ message: string; captured: boolean }>;

  applyDiscount(code: string): Promise<{ message: string; cart: CartGetResponse }>;

  /**
   * Remove the active discount code from the cart.
   */
  removeDiscount(): Promise<{ message: string; cart: CartGetResponse }>;
}

declare class PagesModule {
  /**
   * List all configured pages
   */
  list(): Promise<PagesListResponse>;

  /**
   * Get page data by path (with dynamic route matching)
   */
  getByPath(path: string): Promise<PageDataResponse>;

  /**
   * Get page data by name
   */
  getByName(name: string): Promise<PageDataResponse>;
}

// =============================================================================
// AUTH TYPES
// =============================================================================

export interface CustomerAddress {
  line1: string;
  line2: string;
  /** Street address (alias for line1 on some API responses) */
  address?: string;
  /** Second address line (alias for line2 on some API responses) */
  address_line2?: string;
  city: string;
  state: string | null;
  state_name: string | null;
  zip_code: string;
  country: string;
}

/**
 * A saved address from the multi-address relation (one customer, many
 * addresses). The customer's `address` (single) and flat fields continue to
 * reflect the `is_main` address for backwards compatibility.
 */
export interface SavedAddress {
  id: string;
  label: string;
  line1: string;
  line2: string;
  city: string;
  state: string | null;
  state_name: string | null;
  zip_code: string;
  country: string;
  is_main: boolean;
}

export interface Customer {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  full_name: string;
  phone: string;
  email_verified: boolean;
  has_password: boolean;
  has_address: boolean;
  address: CustomerAddress | null;
  /**
   * All saved addresses (multi-address feature). Optional: older API responses
   * omit it. The single `address` above mirrors the main one.
   */
  addresses?: SavedAddress[];
  accepts_marketing: boolean;
  /** Loyalty points balance */
  points: number;
  metadata: Record<string, any> | null;
  created_at: string;
}

export interface AuthTokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: "Bearer";
  expires_in: number;
  customer: Customer;
}

export interface AuthRefreshResponse {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
}

export interface CustomerProfileUpdate {
  first_name?: string;
  last_name?: string;
  phone?: string;
  address_line1?: string;
  address_line2?: string;
  city?: string;
  state?: string;
  zip_code?: string;
  country?: string;
  accepts_marketing?: boolean;
  /** Arbitrary metadata key-value pairs merged into the customer record */
  metadata?: Record<string, unknown>;
}

declare class AuthModule {
  /** Current access token (public getter — same value as _accessToken) */
  readonly accessToken: string | null;

  /**
   * Internal access token field.
   * The runtime exposes this as a public property; code that reads
   * `dash.auth._accessToken` directly will find it here.
   */
  readonly _accessToken: string | null;

  /** Current customer (if authenticated) */
  readonly customer: Customer | null;

  /** Whether user is authenticated */
  readonly isAuthenticated: boolean;

  /**
   * Request OTP code via email
   * @param email - Customer email address
   */
  requestOTP(email: string, options?: { accepts_marketing?: boolean; captcha_token?: string }): Promise<{ message: string; email: string }>;
  /** Check whether a customer already exists for this org by email and/or phone. */
  checkExists(params: { email?: string; phone?: string }): Promise<{ email_exists: boolean; phone_exists: boolean }>;

  /**
   * Verify OTP and get tokens.
   * Runtime signature: `verifyOTP({ email, code })` (object form).
   * The positional `(email, code)` overload is also accepted for compat.
   */
  verifyOTP(email: string, code: string): Promise<AuthTokenResponse>;
  verifyOTP(options: { email: string; code: string }): Promise<AuthTokenResponse>;

  /**
   * Login with email and password.
   */
  login(options: { email: string; password: string; captcha_token?: string }): Promise<AuthTokenResponse>;

  /**
   * Log a customer in from an abandoned-checkout recovery token
   * ("checkout__<hash>" from a Klaviyo recovery email /checkout?token=...).
   * Applies the returned session; persist the returned cart_id to resume cart.
   */
  loginWithCheckoutToken(token: string): Promise<CheckoutResumeResponse>;

  /**
   * Refresh access token using the stored refresh token.
   * Runtime method is `refreshAccessToken()`; alias `refresh()` is also present.
   */
  refresh(): Promise<AuthRefreshResponse>;
  refreshAccessToken(): Promise<AuthRefreshResponse>;

  /**
   * Logout current customer
   */
  logout(allSessions?: boolean): Promise<void>;

  /**
   * Get current customer profile
   */
  getProfile(): Promise<{ customer: Customer }>;

  /**
   * Update customer profile
   */
  updateProfile(data: CustomerProfileUpdate): Promise<{ customer: Customer }>;

  /**
   * Update customer metadata (key-value pairs, merged server-side).
   */
  updateMetadata(metadata: Record<string, unknown>): Promise<{ customer: Customer }>;

  /** List the authenticated customer's saved addresses. */
  getAddresses(): Promise<{ addresses: SavedAddress[] }>;

  /** Create a new saved address. Set `is_main` to make it the main address. */
  createAddress(data: {
    label?: string;
    line1?: string;
    line2?: string;
    city?: string;
    state?: string | null;
    zip_code?: string;
    country?: string;
    is_main?: boolean;
  }): Promise<{ address: SavedAddress }>;

  /** Update a saved address. Pass `{ is_main: true }` to make it the main one. */
  updateAddress(
    addressId: string,
    data: Partial<{
      label: string;
      line1: string;
      line2: string;
      city: string;
      state: string | null;
      zip_code: string;
      country: string;
      is_main: boolean;
    }>
  ): Promise<{ address: SavedAddress }>;

  /** Delete a saved address. If it was the main one, another is promoted. */
  deleteAddress(addressId: string): Promise<{ deleted: boolean }>;

  /** Mark a saved address as the customer's main address. */
  setMainAddress(addressId: string): Promise<{ address: SavedAddress }>;

  /**
   * Get customer's order history
   */
  getOrders(options?: { limit?: number; offset?: number }): Promise<CustomerOrdersResponse>;
  /** Ask for a "back in stock" email for a sold-out size (signed-in customers only). */
  requestRestock(productSlug: string, sizeId: string): Promise<RestockRequestResponse>;
  /** The signed-in customer's restock emails, open first. */
  getRestockRequests(): Promise<{ restock_requests: RestockRequest[] }>;
  /** Stop one restock email. */
  unsubscribeRestock(requestId: string): Promise<{ restock_request: RestockRequest }>;

  /**
   * Get a single order by ID
   */
  getOrder(orderId: string): Promise<{ order: CheckoutOrder }>;

  /**
   * Check if current IP/session is banned
   */
  checkBan(): Promise<{ banned: boolean; reason?: string }>;

  /**
   * Set auth token (positional form used by legacy code).
   * Prefer `setTokens(access, refresh)` for clarity.
   * Passing null clears the stored token.
   */
  setToken(token: string | null, refreshToken?: string | null): void;

  /**
   * Set tokens manually (e.g., from localStorage on page load)
   */
  setTokens(accessToken: string, refreshToken: string): void;

  /**
   * Clear stored tokens
   */
  clearTokens(): void;

  /**
   * Set a password for the authenticated customer (min 8 chars).
   */
  setPassword(password: string): Promise<{ message: string; customer: Customer }>;

  /**
   * Merge a guest cart into the authenticated customer's cart.
   */
  mergeCart(cartId: string): Promise<{ cart: CartGetResponse; cart_id?: string }>;

  /**
   * Request a password reset code sent to the customer's email.
   */
  requestPasswordReset(email: string): Promise<{ message: string }>;

  /**
   * Reset password using OTP code.
   */
  resetPassword(options: { email: string; code: string; password: string }): Promise<{ message: string }>;
}

export interface CustomerOrdersResponse {
  orders: CheckoutOrder[];
  pagination: Pagination;
}

// =============================================================================
// PAYMENT TYPES
// =============================================================================

export interface StorefrontPaymentProcessor {
  slug: string;
  name: string;
  environment: "test" | "live";
  supported_currencies?: string[];
  features?: string[];
  /** Platform-wide Google Pay merchant id (Authorize.net only), served by the backend. */
  google_pay_merchant_id?: string;
}

export interface PaymentToken {
  /** Opaque token from the processor (Accept.js nonce, etc.) */
  token: string;
  /** Token type descriptor (e.g., "COMMON.ACCEPT.INAPP.PAYMENT") */
  descriptor: string;
}

export interface CardData {
  /** Card number (spaces allowed, will be cleaned) */
  cardNumber: string;
  /** Expiration date in MM/YY or MM/YYYY format */
  expDate: string;
  /** Security code (CVV/CVC) — 3 or 4 digits */
  cvv: string;
}

export interface ChargeData {
  /** Token from tokenize() */
  token: string;
  /** Descriptor from tokenize() */
  descriptor?: string;
  /** Charge amount as a string (e.g., "99.99") */
  amount: string | number;
  /** Currency code (default: "USD") */
  currency?: string;
  /** Invoice or order number */
  invoiceNumber?: string;
  /** Charge description */
  description?: string;
  /** Billing address */
  billing?: {
    first_name?: string;
    last_name?: string;
    address?: string;
    city?: string;
    state?: string;
    zip_code?: string;
    country?: string;
  };
}

export interface ChargeResult {
  success: boolean;
  /** True when Authorize.net FDS held the transaction for fraud review */
  fraud_held?: boolean;
  error?: string;
  transaction?: {
    transaction_id: string;
    auth_code: string;
    response_code: string;
    account_number?: string;
    account_type?: string;
    processor: string;
    amount: string;
    status?: string;
  };
}

export interface AuthorizeData {
  /** Token from tokenize() */
  token: string;
  /** Descriptor from tokenize() */
  descriptor?: string;
  /** Amount to authorize */
  amount: string | number;
  /** Currency code (default: "USD") */
  currency?: string;
  /** Invoice or order number */
  invoiceNumber?: string;
  /** Description */
  description?: string;
  /** Billing address */
  billing?: {
    first_name?: string;
    last_name?: string;
    address?: string;
    city?: string;
    state?: string;
    zip_code?: string;
    country?: string;
  };
}

export interface AuthorizeResult {
  success: boolean;
  error?: string;
  authorization?: {
    transaction_id: string;
    auth_code: string;
    response_code: string;
    account_number?: string;
    account_type?: string;
    processor: string;
    amount: string;
    status: "authorized";
  };
}

export interface CaptureData {
  /** Transaction ID from authorize() */
  transactionId: string;
  /** Amount to capture (optional, defaults to original auth amount) */
  amount?: string | number;
}

export interface CaptureResult {
  success: boolean;
  error?: string;
  transaction?: {
    transaction_id: string;
    auth_code?: string;
    response_code: string;
    processor: string;
    amount?: string;
    status: "captured";
  };
}

export interface VoidData {
  /** Transaction ID from authorize() */
  transactionId: string;
}

export interface VoidResult {
  success: boolean;
  error?: string;
  transaction?: {
    transaction_id: string;
    response_code: string;
    processor: string;
    status: "voided";
  };
}

export interface PaymentClientConfig {
  processor: StorefrontPaymentProcessor;
  client_config: Record<string, string>;
}

declare class AuthorizeNetCSR {
  constructor(config: { api_login_id: string; client_key: string; environment?: string });
  load(): Promise<void>;
  tokenize(cardData: CardData): Promise<PaymentToken>;
}

/** Options passed to dash.payment.googlePay(). */
export interface GooglePayOptions {
  /** Display name shown on the Google Pay sheet. */
  merchantName?: string;
  /** Log every sheet event (address changes, totals, the request) to the console. For test domains. */
  debug?: boolean;
  /** Google-issued merchant id. REQUIRED for production (Google Pay Business Console). */
  merchantId?: string;
  /** Currency code (default "USD"). */
  currencyCode?: string;
  /** Country code (default "US"). */
  countryCode?: string;
  /** Override allowed card networks (default AMEX/DISCOVER/JCB/MASTERCARD/VISA). */
  cardNetworks?: string[];
  /** Override allowed auth methods (default PAN_ONLY/CRYPTOGRAM_3DS). */
  authMethods?: string[];
  /** Override the Google Pay environment ("test" forces TEST, e.g. on localhost). Defaults to the processor env. */
  environment?: "test" | "live";
  /** Ask the Google sheet to collect the buyer's email. */
  emailRequired?: boolean;
  /** Ask the Google sheet to collect the shipping address. */
  shippingAddressRequired?: boolean;
  /** Shipping-address constraints, e.g. { allowedCountryCodes: ["US"], phoneNumberRequired: true }. */
  shippingAddressParameters?: { allowedCountryCodes?: string[]; phoneNumberRequired?: boolean };
  /** Ask the Google sheet to collect the billing address (returned in the token). */
  billingAddressRequired?: boolean;
  /** Require a phone number with the billing address. */
  phoneNumberRequired?: boolean;
  /**
   * Dynamic pricing (true express checkout). Called WHILE the Google Pay sheet
   * is open, with the intermediate address the shopper selected (country/state/
   * city/zip — Google withholds the street line until authorization). Return the
   * recomputed line items + FINAL total so the sheet shows and authorizes the
   * correct amount (shipping + tax), instead of the pre-address estimate.
   * Return `{ error }` to reject an unserviceable address inside the sheet.
   */
  onShippingAddressChange?: (address: {
    countryCode: string;
    administrativeArea: string;
    locality: string;
    postalCode: string;
  }) => Promise<{
    lineItems?: Array<{ label: string; price: string | number; type?: "LINE_ITEM" | "SUBTOTAL" | "TAX" }>;
    totalPrice: string | number;
    currencyCode?: string;
    totalPriceLabel?: string;
    error?: string | { message: string };
  } | { error: string | { message: string } }>;
}

/** A Google Pay address as returned in the token (administrativeArea = state). */
export interface GooglePayAddress {
  name?: string;
  address1?: string;
  address2?: string;
  address3?: string;
  locality?: string;
  administrativeArea?: string;
  postalCode?: string;
  countryCode?: string;
  phoneNumber?: string;
  sortingCode?: string;
}

/** Transaction info passed to requestToken()/getTransactionInfo. */
export interface GooglePayTransactionInfo {
  /** Order total, e.g. "99.99". */
  totalPrice: string | number;
  /** Override the configured currency code. */
  currencyCode?: string;
  /** Optional label shown on the sheet. */
  totalPriceLabel?: string;
}

/** Styling options for the official Google Pay button. */
export interface GooglePayButtonOptions {
  buttonColor?: "default" | "black" | "white";
  buttonType?: "buy" | "pay" | "checkout" | "order" | "plain" | "short" | "long";
  buttonSizeMode?: "static" | "fill";
  buttonRadius?: string | number;
}

/** Normalized token returned by Google Pay — same shape as PaymentToken. */
export interface GooglePayToken extends PaymentToken {
  /** Buyer email, if emailRequired was set. */
  email?: string;
  /** Shipping address, if shippingAddressRequired was set. */
  shippingAddress?: GooglePayAddress | null;
  /** Billing address, if billingAddressRequired was set. */
  billingAddress?: GooglePayAddress | null;
  /** Raw Google Pay PaymentData object (for advanced use). */
  paymentData: any;
}

/**
 * Google Pay controller. Produces a { token, descriptor } that drops straight
 * into dash.checkout.complete({ payment_token }) — no backend changes needed.
 */
export declare class GooglePayCSR {
  constructor(config: {
    gateway: string;
    gatewayMerchantId: string;
    environment?: string;
    merchantName?: string;
    merchantId?: string;
    currencyCode?: string;
    countryCode?: string;
    cardNetworks?: string[];
    authMethods?: string[];
    descriptor?: string;
  });
  /** Load pay.js and build the PaymentsClient. Idempotent. */
  load(): Promise<void>;
  /** Whether this device/user can pay with Google Pay. Never throws. */
  isAvailable(): Promise<boolean>;
  /** Create the official Google Pay button element (append it yourself). */
  createButton(options?: GooglePayButtonOptions & { onClick?: () => void }): HTMLElement;
  /** Render the button into a container and wire its click to requestToken(). */
  renderButton(
    container: HTMLElement,
    options: {
      onToken: (token: GooglePayToken) => void | Promise<void>;
      getTransactionInfo?: GooglePayTransactionInfo | (() => GooglePayTransactionInfo);
      onError?: (err: any) => void;
      onCancel?: () => void;
      button?: GooglePayButtonOptions;
    }
  ): HTMLElement;
  /** Open the Google Pay sheet (from a user gesture) and return a token. */
  requestToken(txInfo: GooglePayTransactionInfo): Promise<GooglePayToken>;
}

declare class PaymentModule {
  constructor(client: DashClient);

  /** Whether the processor's client library has been loaded */
  readonly isLoaded: boolean;

  /** The active processor's slug (e.g., "authorize-net") */
  readonly processorSlug: string | null;

  /**
   * Load the active payment processor's client library.
   * Call once in your app's layout/header (CSR only).
   * Fetches public keys and dynamically loads only the required library.
   *
   * @example
   * const processor = await dash.payment.load();
   * console.log(processor.slug); // "authorize-net"
   */
  load(): Promise<StorefrontPaymentProcessor>;

  /**
   * Get the active processor info without loading the client library.
   */
  getProcessor(): Promise<StorefrontPaymentProcessor | null>;

  /**
   * Tokenize card data. CSR only — must call load() first.
   *
   * For Authorize.net: pass { cardNumber, expDate, cvv }
   *
   * @example
   * const { token, descriptor } = await dash.payment.tokenize({
   *   cardNumber: "4111111111111111",
   *   expDate: "12/25",
   *   cvv: "123",
   * });
   */
  tokenize(cardData: CardData): Promise<PaymentToken>;

  /**
   * Create a Google Pay controller bound to the org's active processor.
   * Requires load() first. Currently only Authorize.net is supported.
   *
   * Developers never touch the Google API directly:
   * @example
   * const gpay = dash.payment.googlePay({ merchantName: "My Store" });
   * if (await gpay.isAvailable()) {
   *   gpay.renderButton(el, {
   *     getTransactionInfo: () => ({ totalPrice: total }),
   *     onToken: async ({ token, descriptor }) => {
   *       await dash.checkout.complete({ cartId, shipping,
   *         payment_token: { token, descriptor, billing } });
   *     },
   *   });
   * }
   */
  googlePay(options?: GooglePayOptions): GooglePayCSR;

  /**
   * Charge a tokenized payment via the storefront API.
   * Single-step flow: Authorize AND capture in one call.
   * Works on both CSR and SSR.
   *
   * @example
   * const result = await dash.payment.charge({
   *   token: tokenData.token,
   *   descriptor: tokenData.descriptor,
   *   amount: "99.99",
   *   invoiceNumber: "1001",
   * });
   */
  charge(data: ChargeData): Promise<ChargeResult>;

  /**
   * Authorize a payment without capturing (place a hold on the card).
   * Two-step flow, Step 1. Use capture() to charge, or void() to release.
   *
   * @example
   * const auth = await dash.payment.authorize({
   *   token: tokenData.token,
   *   descriptor: tokenData.descriptor,
   *   amount: "99.99",
   * });
   * // Store auth.authorization.transaction_id for later
   */
  authorize(data: AuthorizeData): Promise<AuthorizeResult>;

  /**
   * Capture a previously authorized payment.
   * Two-step flow, Step 2a: Actually charge the held funds.
   *
   * @example
   * const result = await dash.payment.capture({
   *   transactionId: "123456789",
   *   amount: "89.99", // Optional: capture less than authorized
   * });
   */
  capture(data: CaptureData): Promise<CaptureResult>;

  /**
   * Void a previously authorized payment.
   * Two-step flow, Step 2b: Release the hold without charging.
   *
   * @example
   * const result = await dash.payment.void({
   *   transactionId: "123456789",
   * });
   */
  void(data: VoidData): Promise<VoidResult>;

  /**
   * Get the underlying processor handler for advanced usage.
   */
  getHandler(): AuthorizeNetCSR;
}

// =============================================================================
// BLOG TYPES
// =============================================================================

export interface BlogCategory {
  id: string;
  name: string;
  slug: string;
  description: string;
  color: string;
  post_count: number;
}

export interface BlogPost {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  featured_image: string | null;
  featured_image_alt: string;
  author_name: string;
  /** @deprecated Legacy alias — use `author_name` instead. May be present on older API responses. */
  author?: string;
  category: {
    id: string;
    name: string;
    slug: string;
    color: string;
  } | null;
  tags: string[];
  is_featured: boolean;
  reading_time: number;
  view_count: number;
  published_at: string | null;
  created_at: string;

  // Detail fields (only present when fetched with get())
  content?: string;
  allow_comments?: boolean;
  seo?: BlogPostSEO;

  // Flat SEO fields — some API versions flatten these alongside the `seo` object
  seo_title?: string | null;
  seo_description?: string | null;
  seo_keywords?: string | null;
}

export interface BlogPostSEO {
  title: string;
  description: string;
  keywords: string;
  og_image: string | null;
}

export interface BlogPostsListOptions {
  /** Number of posts per page (default: 20, max: 100) */
  limit?: number;
  /** Pagination offset (default: 0) */
  offset?: number;
  /** Filter by category slug */
  category?: string;
  /** Filter by tag */
  tag?: string;
  /** Search in title and excerpt */
  search?: string;
  /** Only featured posts */
  featured?: boolean;
  /** Filter by custom fields (e.g. {show_in_sidebar: true, homepage_section: "latest_news"}) */
  customFields?: Record<string, string | number | boolean>;
}

export interface BlogPostsListResponse {
  posts: BlogPost[];
  pagination: Pagination;
  /** @deprecated Runtime returns `posts`, not `blogs`. This alias exists for legacy code. */
  blogs?: BlogPost[];
}

export interface BlogPostGetOptions {
  /** View tracking mode (default: "session") */
  trackViews?: "session" | "always" | "none";
}

export interface BlogPostGetResponse {
  post: BlogPost;
  /** @deprecated Runtime wraps single post in `post`, not `blog`. This alias exists for legacy code. */
  blog?: BlogPost;
}

export interface BlogPostSeoResponse {
  seo: BlogPostSEO & { canonical_slug: string };
}

export interface BlogCategoriesListResponse {
  categories: BlogCategory[];
}

declare class SeoModule {
  /**
   * Get SEO metadata for a product
   */
  product(slug: string): Promise<{ seo: ProductSEO & { canonical_slug: string } }>;

  /**
   * Get SEO metadata for a blog post
   */
  blogPost(slug: string): Promise<BlogPostSeoResponse>;
}

declare class BlogModule {
  /**
   * List published blog posts with optional filters
   */
  list(options?: BlogPostsListOptions): Promise<BlogPostsListResponse>;

  /**
   * Get a single blog post by slug (with full content)
   * @param slug - Blog post slug
   * @param options - Options (trackViews: "session" | "always" | "none")
   */
  get(slug: string, options?: BlogPostGetOptions): Promise<BlogPostGetResponse>;

  /**
   * Get SEO metadata for a blog post
   */
  getSeo(slug: string): Promise<BlogPostSeoResponse>;

  /**
   * List active blog categories
   */
  listCategories(): Promise<BlogCategoriesListResponse>;

  /**
   * Legacy callable alias for `listCategories()`.
   * Some legacy code calls `dash.blog.categories()` directly.
   */
  categories(): Promise<BlogCategoriesListResponse>;
}

// =============================================================================
// CHECKOUT TYPES
// =============================================================================

export interface CheckoutStartData {
  /** Cart ID */
  cartId: string;
  /** Customer email address */
  email?: string;
  /** Marketing consent flag — passed through to the customer record */
  acceptsMarketing?: boolean;
}

export interface CheckoutStartResponse {
  message: string;
  email: string;
  /** Whether the user is authenticated (skipped OTP) */
  authenticated: boolean;
  customer: {
    first_name: string;
    last_name: string;
    has_address: boolean;
    address: CustomerAddress | null;
  };
  /** Preview of customer record — may be present on some API versions */
  customer_preview?: {
    first_name?: string;
    last_name?: string;
    email?: string;
    phone?: string;
    has_address?: boolean;
    address?: CustomerAddress | null;
  };
  cart_summary: {
    item_count: number;
    subtotal: string;
    items: CartItem[];
  };
  /**
   * Per-product shipping restrictions (cannabis compliance).
   * Keys are product IDs; values describe the product and its allowed states.
   * Only products with state-level restrictions are present.
   */
  product_restrictions?: Record<string, {
    name: string;
    allowed_state_codes: string[];
  }>;
}

export interface CheckoutShipping {
  first_name: string;
  last_name: string;
  phone?: string;
  address: string;
  address_line2?: string;
  city: string;
  state: string;
  zip_code: string;
  country?: string;
}

export interface CheckoutCompleteData {
  /** Cart ID */
  cartId: string;
  /**
   * Affiliate link code to credit. Defaults to the `aflnk` cookie the
   * storefront's link grabber sets; null sends none. Credited with no
   * discount when the shopper did not apply a code themselves.
   */
  affiliateLink?: string | null;
  /** Customer email */
  email?: string;
  /** 6-digit OTP verification code */
  code?: string;
  /** Shipping address */
  shipping: CheckoutShipping;
  /** Optional order notes */
  customerNotes?: string;
  /** Payment authorization data */
  payment?: {
    transaction_id: string;
    auth_code: string;
    captured?: boolean;
    fraud_held?: boolean;
    response_code?: string;
    account_number?: string;
    account_type?: string;
    processor?: string;
    avs_result_code?: string;
    cvv_result_code?: string;
    posthog_session_id?: string;
  };
  /** Frontend-calculated totals to override server-side calculation */
  totals?: {
    shipping_cost: number;
    tax_amount: number;
  };
  /** Captcha token for bot protection */
  captcha_token?: string;
}

export interface CheckoutOrderItem {
  product_name: string;
  size_label: string;
  product_image: string | null;
  quantity: number;
  unit_price: string;
  total_price: string;
}

export interface CheckoutOrder {
  id: string;
  order_number: number;
  status: string;
  payment_status: string;
  email: string;
  shipping: CheckoutShipping;
  items: CheckoutOrderItem[];
  subtotal: string;
  shipping_cost: string;
  tax_amount: string;
  total: string;
  customer_notes: string;
  created_at: string;
  /** Currency code (ISO 4217, e.g. "USD") — present on extended order objects */
  currency?: string;
  /** Discount amount applied to this order */
  discount_amount?: string;
  /** Discount code applied to this order */
  discount_code?: string | null;
  /** Number of distinct line items */
  item_count?: number;
  /** Tracking number for the shipment */
  tracking_number?: string | null;
  /** Carrier code (e.g. "ups", "fedex") */
  carrier?: string | null;
  /** Fully qualified tracking URL */
  tracking_url?: string | null;
  /** Whether a label has been printed */
  label_printed?: boolean;
  /** Refund amount if any */
  refund_amount?: string | null;
  /** Internal notes */
  internal_notes?: string;
  /** Affiliate discount code applied */
  affiliate_code?: string | null;
  /** Referral code applied */
  referral_code?: string | null;
  /** Full customer name (first + last) — convenience field on extended order objects */
  customer_name?: string | null;
}

export interface CheckoutCompleteResponse {
  order: CheckoutOrder;
  customer: Customer;
  access_token: string;
  refresh_token: string;
}

export interface WholesaleRequestData {
  /** Cart ID */
  cartId: string;
  /** Customer email — used to create-or-fetch the customer record */
  email: string;
  /** Shipping address */
  shipping: CheckoutShipping;
  /** Optional order notes */
  customerNotes?: string;
  /** Optional totals overrides (shipping, tax, surcharge) */
  totals?: {
    shipping_cost?: number;
    tax_amount?: number;
    surcharge?: number;
    surcharge_rate?: string;
  };
}

export interface WholesaleRequestResponse {
  order: CheckoutOrder;
  customer: Customer;
}

export interface CheckoutResumeResponse {
  message: string;
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  customer: Customer;
  cart_id: string;
  cart_summary: {
    item_count: number;
    subtotal: string;
    items: any[];
  };
}

declare class CheckoutModule {
  /**
   * Start checkout — validates cart and sends OTP verification code to email.
   * Creates customer account if one doesn't exist for the email.
   *
   * @example
   * const result = await dash.checkout.start({
   *   cartId: dash.cart.cartId,
   *   email: "customer@example.com",
   * });
   */
  start(data: CheckoutStartData): Promise<CheckoutStartResponse>;

  /**
   * Complete checkout — verifies OTP code, creates order from cart.
   * Returns the created order, customer data, and auth tokens.
   *
   * @example
   * const result = await dash.checkout.complete({
   *   cartId: dash.cart.cartId,
   *   email: "customer@example.com",
   *   code: "123456",
   *   shipping: {
   *     first_name: "John", last_name: "Doe",
   *     address: "123 Main St", city: "New York",
   *     state: "NY", zip_code: "10001",
   *   },
   * });
   */
  complete(data: CheckoutCompleteData): Promise<CheckoutCompleteResponse>;

  /**
   * Get allowed shipping locations (countries and states).
   * Returns only locations the organization ships to.
   *
   * @example
   * const { countries } = await dash.checkout.getShippingLocations();
   */
  getShippingLocations(): Promise<{
    countries: Array<{
      id: string;
      name: string;
      code: string;
      states: Array<{ id: string; name: string; code: string }>;
    }>;
  }>;

  /**
   * Get the list of globally banned state names for the organization.
   * Useful for footer disclaimers.
   *
   * @example
   * const { banned_states } = await dash.checkout.getBannedStateNames();
   */
  getBannedStateNames(): Promise<{
    banned_states: Array<{ code: string; name: string }>;
  }>;

  /**
   * Resume an abandoned checkout from a recovery token.
   *
   * Token format: "checkout__<hash>" — emitted to Klaviyo on checkout start
   * and used in abandoned-checkout emails as /checkout?token=...
   * Logs the customer fully back in and returns the cart.
   *
   * Prefer `dash.auth.loginWithCheckoutToken(token)` which also applies the
   * returned session to the auth module.
   *
   * @example
   * const r = await dash.checkout.resume("checkout__abc123...");
   */
  resume(token: string): Promise<CheckoutResumeResponse>;

  /**
   * Place a wholesale order request — NO payment, NO OTP.
   *
   * Separate from the B2C `start`/`complete` flow. Creates a
   * "confirmed / unpaid" order for staff to review and invoice (e.g. via
   * QuickBooks). The customer is created-or-fetched by email server-side.
   *
   * SECRET-KEY ONLY: the backend rejects public keys for this endpoint, so
   * call it from a server (sk_ key), never from the browser.
   *
   * @example
   * const { order } = await dash.checkout.placeWholesaleRequest({
   *   cartId: "cart_xxx",
   *   email: "buyer@clinic.com",
   *   shipping: { first_name: "John", last_name: "Doe",
   *     address: "123 Main St", city: "Miami", state: "FL", zip_code: "33101" },
   *   customerNotes: "Company: Acme Clinic",
   * });
   */
  placeWholesaleRequest(data: WholesaleRequestData): Promise<WholesaleRequestResponse>;
}

// =============================================================================
// SHIPPING MODULE
// =============================================================================

/** A single shipping rate option returned by the shipping provider */
export interface ShippingRate {
  /** Human-readable service name (e.g., "USPS Priority Mail") */
  serviceName: string;
  /** Service code for creating labels (e.g., "usps_priority_mail") */
  serviceCode: string;
  /** Base shipping cost */
  shipmentCost: number;
  /** Additional costs (insurance, surcharges, etc.) */
  otherCost: number;
  /** Estimated transit days (null if unknown) */
  transitDays: number | null;
  /** Computed total cost (shipmentCost + otherCost), added by helper methods */
  totalCost?: number;
  /** Additional provider-specific fields */
  [key: string]: any;
}

export interface ShippingRateOptions {
  /** Carrier code (e.g., "stamps_com", "fedex", "ups") */
  carrier_code?: string;
  /** Carrier IDs (e.g., ["se-xxxxxx"]) */
  carrier_ids?: string[];
  /** Service type filter (e.g., "ups_ground", "usps_priority_mail") */
  service_type?: string;
  /** Origin zip code */
  from_postal?: string;
  /** Full origin address object */
  from_address?: Record<string, string>;
  /** Destination street address (needed for accurate rates) */
  to_address_line1?: string;
  /** Destination city (needed for accurate rates) */
  to_city?: string;
  /** Destination recipient name */
  to_name?: string;
  /** Destination state abbreviation (e.g., "CA") */
  to_state?: string;
  /** Destination country code (default: "US") */
  to_country?: string;
  /** Destination zip code */
  to_postal: string;
  /** Package weight in ounces */
  weight_oz: number;
  /** Package dimensions */
  dimensions?: {
    length: number;
    width: number;
    height: number;
    units?: string;
  };
}

export interface ShippingRateResult {
  /** The selected rate (cheapest or fastest) */
  rate: ShippingRate | null;
  /** All available rates, sorted by the selection criteria */
  all_rates: ShippingRate[];
}

export interface ShippingGetRateOptions extends ShippingRateOptions {
  /** Rate selection preference (default: "cheapest") */
  prefer?: "cheapest" | "fastest";
}

export interface FreeShippingCheck {
  /** Whether the subtotal meets the free shipping threshold */
  qualifies: boolean;
  /** The free shipping threshold (null if not configured) */
  threshold: number | null;
  /** Amount remaining to qualify for free shipping */
  remaining: number;
}

export interface TrackingResult {
  tracking_number: string;
  carrier_code: string;
  tracking_url: string;
}

export interface AddressValidationInput {
  /** Street address line 1 */
  address_line1: string;
  /** Apt / Suite / PO Box (optional) */
  address_line2?: string;
  /** City name */
  city: string;
  /** State abbreviation (e.g. "CA") */
  state: string;
  /** ZIP / postal code */
  postal_code: string;
  /** Country code (default: "US") */
  country_code?: string;
}

export interface AddressValidationResult {
  /** Validation status from the shipping provider */
  status: "verified" | "unverified" | "warning";
  /** The original address as submitted */
  original_address: {
    address_line1: string;
    city: string;
    state: string;
    postal_code: string;
  };
  /** The normalized/corrected address from the provider */
  matched_address: {
    address_line1: string;
    city_locality: string;
    state_province: string;
    postal_code: string;
    country_code: string;
  };
  /** Informational or warning messages from the provider */
  messages: string[];
}

export declare class ShippingModule {
  /**
   * Get all available shipping rates for a package.
   * Returns the raw list of rate options from the shipping provider.
   *
   * @example
   * const { rates } = await dash.shipping.getRates({
   *   carrier_code: "stamps_com",
   *   to_state: "CA",
   *   to_postal: "90210",
   *   weight_oz: 16,
   * });
   */
  getRates(options: ShippingRateOptions): Promise<{ rates: ShippingRate[] }>;

  /**
   * Validate and normalize a shipping address via ShipEngine.
   *
   * @example
   * const result = await dash.shipping.validateAddress({
   *   address_line1: "123 Main St",
   *   city: "New York",
   *   state: "NY",
   *   postal_code: "10001",
   * });
   */
  validateAddress(address: AddressValidationInput): Promise<AddressValidationResult>;

  /**
   * Track a shipment by tracking number.
   *
   * @example
   * const tracking = await dash.shipping.track("1Z999AA10123456784", "ups");
   * console.log(tracking.tracking_url);
   */
  track(trackingNumber: string, carrierCode?: string): Promise<TrackingResult>;

  /**
   * Get the cheapest shipping rate for a package.
   * Fetches all rates and returns the one with the lowest total cost.
   *
   * @example
   * const { rate } = await dash.shipping.getCheapestRate({
   *   carrier_code: "stamps_com",
   *   to_postal: "10001",
   *   weight_oz: 8,
   * });
   * console.log(rate.serviceName);  // "USPS First Class Mail"
   * console.log(rate.totalCost);    // 4.25
   */
  getCheapestRate(options: ShippingRateOptions): Promise<ShippingRateResult>;

  /**
   * Get the fastest shipping rate for a package.
   * Fetches all rates and returns the one with fewest transit days.
   * Ties broken by lowest cost.
   *
   * @example
   * const { rate } = await dash.shipping.getFastestRate({
   *   carrier_code: "fedex",
   *   to_postal: "73301",
   *   weight_oz: 32,
   * });
   * console.log(rate.serviceName);  // "FedEx 2Day"
   * console.log(rate.transitDays);  // 2
   */
  getFastestRate(options: ShippingRateOptions): Promise<ShippingRateResult>;

  /**
   * Get a single recommended shipping rate.
   * Returns cheapest by default, or fastest if prefer="fastest".
   *
   * @example
   * const rate = await dash.shipping.getRate({
   *   carrier_code: "stamps_com",
   *   to_postal: "90210",
   *   weight_oz: 16,
   * });
   */
  getRate(options: ShippingGetRateOptions): Promise<ShippingRate | null>;

  /**
   * Check if an order qualifies for free shipping based on store config.
   *
   * @example
   * const result = await dash.shipping.checkFreeShipping(cart.subtotal);
   * if (!result.qualifies) {
   *   console.log(`Add $${result.remaining.toFixed(2)} more for free shipping`);
   * }
   */
  checkFreeShipping(subtotal: number | string): Promise<FreeShippingCheck>;
}

// =============================================================================
// TAX MODULE
// =============================================================================

export interface TaxCalculateOptions {
  /** Two-letter US state code (e.g., "CA") */
  state: string;
  /**
   * Ship-to ZIP code. Adds the county/city rate where the platform has one
   * (New York today), so the quote matches what the order is charged.
   */
  zip?: string;
  /** Cart ID to calculate tax for */
  cart_id?: string;
  /** Manual items list (alternative to cart_id) */
  items?: Array<{
    price: number;
    quantity: number;
    /** @deprecated Use tax_class instead */
    cannabinoid_type?: string;
    /** Dynamic tax class slug */
    tax_class?: string;
  }>;
}

export interface TaxBreakdownItem {
  /** @deprecated Use tax_class instead */
  cannabinoid_type: string;
  /** Dynamic tax class slug */
  tax_class?: string;
  /** Display name of the tax class */
  tax_class_name?: string;
  rate: string | null;
  special_tax_rate: string;
  special_tax_name?: string;
  tax_amount: string;
  illegal?: boolean;
}

export interface TaxCalculateResponse {
  state_code: string;
  state_name: string;
  tax_breakdown: TaxBreakdownItem[];
  total_tax: string;
  is_legal: boolean;
  illegal_items: Array<{ cannabinoid_type: string; tax_class?: string; message: string }>;
  fallback: boolean;
}

export interface TaxLegalityCheck {
  /** Whether all items are legal in the state */
  legal: boolean;
  /** Details about illegal items */
  illegal_items: Array<{ cannabinoid_type: string; message: string }>;
  /** Full state name */
  state_name: string;
  /** Two-letter state code */
  state_code: string;
}

export interface TaxOrderTotal {
  subtotal: number;
  shipping: number;
  discount: number;
  tax: number;
  total: number;
}

export interface TaxOrderTotalParams {
  /** Cart subtotal */
  subtotal: number | string;
  /** Shipping cost (default: 0) */
  shipping?: number | string;
  /** Discount amount as positive number (default: 0) */
  discount?: number | string;
  /** Result from calculate() */
  taxResult: TaxCalculateResponse;
}

export interface TaxBreakdownLine {
  /** Human-readable label (e.g., "State Tax (delta9)") */
  label: string;
  /** Tax amount as string (e.g., "3.50") */
  amount: string;
  /** Tax rate as string with % (e.g., "7.25%") */
  rate: string;
}

export declare class TaxModule {
  /**
   * Calculate tax for items in a given state.
   * Supports per-cannabinoid tax rates when state configs are available.
   * Falls back to flat org tax rate when no state configs exist.
   *
   * @example
   * const result = await dash.tax.calculate({ state: "CA", cart_id: dash.cart.cartId });
   * console.log(result.total_tax);  // "12.50"
   * console.log(result.is_legal);   // true
   */
  calculate(options: TaxCalculateOptions): Promise<TaxCalculateResponse>;

  /**
   * Calculate tax for the current cart in a given state.
   * Automatically uses the cart module's cart ID.
   *
   * @example
   * const result = await dash.tax.calculateForCart("NY");
   * console.log(result.total_tax);  // "8.50"
   */
  calculateForCart(state: string): Promise<TaxCalculateResponse>;

  /**
   * Check if all items are legal to sell in a given state.
   * Returns a simple boolean + details about illegal items.
   *
   * @example
   * const check = await dash.tax.checkLegality("ID");
   * if (!check.legal) {
   *   check.illegal_items.forEach(item => console.log(item.message));
   * }
   */
  checkLegality(state: string, options?: Omit<TaxCalculateOptions, "state">): Promise<TaxLegalityCheck>;

  /**
   * Parse the total tax amount from a calculation result as a number.
   *
   * @example
   * const taxAmount = dash.tax.getTotal(result);  // 12.50
   */
  getTotal(taxResult: TaxCalculateResponse): number;

  /**
   * Calculate the complete order total with subtotal, shipping, discount, and tax.
   *
   * @example
   * const totals = dash.tax.getOrderTotal({
   *   subtotal: cart.subtotal,
   *   shipping: shippingRate.totalCost,
   *   discount: 5.00,
   *   taxResult,
   * });
   * console.log(totals.total);  // 112.75
   */
  getOrderTotal(params: TaxOrderTotalParams): TaxOrderTotal;

  /**
   * Format a tax breakdown into human-readable lines for display in checkout UI.
   *
   * @example
   * const lines = dash.tax.formatBreakdown(result);
   * // [{ label: "State Tax (general)", amount: "3.50", rate: "7.25%" }]
   */
  formatBreakdown(taxResult: TaxCalculateResponse): TaxBreakdownLine[];

  /**
   * Get a cached tax result if available.
   */
  getCached(state: string, cartId?: string): TaxCalculateResponse | null;

  /**
   * Clear the tax result cache.
   * Call this when cart contents change.
   */
  clearCache(): void;
}

// =============================================================================
// COA (Certificate of Analysis) MODULE
// =============================================================================

export interface CoaProduct {
  id: string;
  name: string;
  slug: string;
  image: string | null;
  variation_count: number;
  /** Inline variations — present when COA list is fetched with variation detail */
  variations?: CoaVariation[];
}

export interface CoaListResponse {
  products: CoaProduct[];
  total_products: number;
}

export interface CoaVariation {
  id: string;
  name: string;
  slug: string;
  image: string | null;
  lab_report_url: string | null;
  /** Array of lab report objects with name and URL (matches backend response) */
  lab_report_urls?: { name: string; url: string }[] | null;
}

export interface CoaProductResponse {
  product: {
    id: string;
    name: string;
    slug: string;
    description: string;
    image: string | null;
  };
  variations: CoaVariation[];
  total_variations: number;
}

export interface CoaDetailResponse {
  product: {
    id: string;
    name: string;
    slug: string;
    selectable_variations?: { slug: string }[] | null;
    category?: {
      id: string;
      name: string;
      slug: string;
      parent?: { id: string; name: string; slug: string } | null;
    } | null;
  };
  variation: {
    id: string;
    name: string;
    slug: string;
    image: string | null;
    lab_report_url: string | null;
    /** Array of lab report objects with name and URL (matches backend response) */
    lab_report_urls?: { name: string; url: string }[] | null;
  };
}

export declare class CoaModule {
  constructor(client: DashClient);

  /** List products that have at least one variation with a lab-report file */
  list(options?: { q?: string; includeVariations?: boolean }): Promise<CoaListResponse>;

  /** Get a product and its variations that have COA files */
  getProduct(productSlug: string): Promise<CoaProductResponse>;

  /** Get a single variation's COA detail (lab report URL) */
  getVariation(productSlug: string, variationSlug: string): Promise<CoaDetailResponse>;
}

// =============================================================================
// LEGAL DOCUMENT TYPES
// =============================================================================

export interface LegalDocumentListItem {
  title: string;
  slug: string;
  updated_at: string;
}

export interface LegalDocumentDetail {
  title: string;
  slug: string;
  content: string;
  updated_at: string;
}

export interface LegalDocumentsListResponse {
  documents: LegalDocumentListItem[];
}

export interface LegalDocumentResponse {
  document: LegalDocumentDetail;
}

export declare class LegalModule {
  constructor(client: DashClient);

  /** List all published legal documents (title, slug, updated_at) */
  list(): Promise<LegalDocumentsListResponse>;

  /** Get a single legal document by slug (full content) */
  get(slug: string): Promise<LegalDocumentResponse>;
}

// =============================================================================
// MEDIA MODULE
// =============================================================================

export interface MediaItem {
  id: string;
  name: string;
  url: string;
  alt_text: string;
  file_type: string;
  mime_type: string;
  width: number | null;
  height: number | null;
  tags: string[];
  metadata: Record<string, string>;
}

export interface MediaGetFolderOptions {
  metadata?: Record<string, string>;
}

export interface MediaFolderResponse {
  folder: string;
  items: MediaItem[];
}

export interface MediaByNameResponse {
  file: {
    id: string;
    name: string;
    url: string;
    alt_text: string;
    width: number | null;
    height: number | null;
  };
}

export declare class MediaModule {
  constructor(client: DashClient);

  /**
   * Get all media files within a named folder
   * @param folderName - The folder name (e.g. "gallery_01")
   * @param options - Optional filters (e.g. { metadata: { type: "hero" } })
   *
   * @example
   * const { items } = await dash.media.getFolder("gallery_01");
   * items.forEach(img => console.log(img.url));
   *
   * // Filter by metadata
   * const heroes = await dash.media.getFolder("gallery_01", { metadata: { type: "hero" } });
   */
  getFolder(folderName: string, options?: MediaGetFolderOptions): Promise<MediaFolderResponse>;

  /**
   * Get a single media file by its name field
   * @param name - The exact name of the media file (e.g. "brick_desktop")
   *
   * @example
   * const { file } = await dash.media.getByName("brick_desktop");
   * console.log(file.url);
   */
  getByName(name: string): Promise<MediaByNameResponse>;
}

export interface HtmlTemplate {
  id: string;
  slug: string;
  name: string;
  html: string;
}

export declare class HtmlTemplatesModule {
  constructor(client: DashClient);

  /**
   * Fetch an HTML template by id or slug. Inactive templates return 404.
   *
   * @example
   * const { template } = await dash.htmlTemplates.get("htmltmpl__abc123");
   * // template.html → raw HTML string
   */
  get(idOrSlug: string): Promise<{ template: HtmlTemplate }>;
}

export declare class EmailModule {
  constructor(client: DashClient);

  /**
   * Identify/update a customer profile in the email provider (Klaviyo).
   */
  identify(options: {
    email: string;
    first_name?: string;
    last_name?: string;
    phone?: string;
    properties?: Record<string, any>;
  }): Promise<{ message: string }>;

  /**
   * Track an event in the email provider (Klaviyo).
   * Events can trigger flows (order confirmations, abandoned cart, etc.)
   */
  track(options: {
    email: string;
    event: string;
    properties?: Record<string, any>;
  }): Promise<{ message: string }>;
}

// =============================================================================
// DISCOUNT STORE TYPES
// =============================================================================

/**
 * A loyalty balance, in both units, with the merchant's preference.
 *
 * BOTH NUMBERS ARE ALWAYS SENT. A client given only the cash figure
 * cannot render points if the tenant switches; a client given only
 * points has to know the rate to render money, which puts the
 * arithmetic back in the browser. The server sends both and says which
 * to lead on.
 *
 * `cash_value` is a decimal STRING, like every other money field in
 * this API, because a float cannot hold 12.50 exactly and a balance is
 * not the place to find that out. It is null when the merchant's rate
 * is unusable, in which case show the points and say nothing about
 * money.
 */
export interface LoyaltyBalance {
  /** The ledger value. Always present, always authoritative. */
  points: number;
  /** What the merchant wants shown. */
  display_mode: "points" | "cashback";
  /** Points to one unit of currency, or null if not configured. */
  points_per_currency_unit: number | null;
  /** ISO 4217, matching the org. */
  currency: string;
  /** `points` as money, floored to the cent. Null if not convertible. */
  cash_value: string | null;
}

export interface DiscountStoreProduct {
  id: string;
  title: string;
  description: string;
  is_percentage: boolean;
  rate: string;
  min_subtotal: string | null;
  max_subtotal: string | null;
  point_cost: number;
  /**
   * `point_cost` as money, computed server-side, or null when the
   * merchant shows points rather than cash.
   *
   * Do not derive this in the browser from `point_cost` and the rate:
   * the server floors to the cent and a client rounding differently is
   * a price that disagrees with the one that gets charged.
   */
  cash_cost?: string | null;
  display_order: number;
}

export interface DiscountStoreListResponse {
  products: DiscountStoreProduct[];
  /** The raw ledger value. Null when nobody is signed in. */
  customer_points: number | null;
  /**
   * The same balance in both units, with the merchant's preference.
   *
   * Prefer this over `customer_points` for anything a customer reads.
   * `customer_points` is kept because it shipped first and removing it
   * would break every storefront already reading it.
   */
  balance?: LoyaltyBalance | null;
}

export interface DiscountStoreRedeemResponse {
  success: boolean;
  discount_code: {
    id: string;
    code: string;
    is_percentage: boolean;
    rate: string;
    min_subtotal: string | null;
    max_subtotal: string | null;
    valid_from: string | null;
    valid_until: string | null;
  };
  points_remaining: number;
  /**
   * The balance AFTER the redemption, in both units.
   *
   * Sent so a cash-mode storefront does not have to convert
   * `points_remaining` itself to update what it shows.
   */
  balance?: LoyaltyBalance;
}

export declare class DiscountStoreModule {
  constructor(client: DashClient);

  /** List available discount store products (includes customer points if authenticated) */
  list(): Promise<DiscountStoreListResponse>;

  /** Redeem a product using loyalty points (requires auth) */
  redeem(productId: string): Promise<DiscountStoreRedeemResponse>;
}

// =============================================================================
// LOYALTY SUMMARY TYPES
// =============================================================================

/**
 * One way to earn, with the server's own wording for it.
 *
 * `display` is the string to print. It is "$5.00" on a cash-back
 * tenant and "500 points" on a points tenant, and which of those it
 * is was decided server-side, beside the conversion a redemption is
 * actually measured against. Do not rebuild it from `points`.
 */
export interface LoyaltyEarnRule {
  /** Stable key: "signup", "first_order", "referral". */
  key: string;
  title: string;
  /** The raw ledger figure. The ledger is always points. */
  points: number;
  /** "Once", "Every referral". */
  limit: string;
  /** Decimal string, or null when the tenant presents points. */
  cash_value: string | null;
  /** Print this. */
  display: string;
}

/**
 * What a dollar spent earns.
 *
 * The rate is set per ProductSize, so min and max can differ. When
 * they do, `display` is NULL: the server refuses to write a headline
 * claim the catalogue does not support, and a range is not a safer
 * way to state a number nobody has confirmed.
 */
export interface LoyaltyEarnRate {
  points_per_dollar_min: number;
  points_per_dollar_max: number;
  /** Only meaningful in cash-back mode. Decimal strings. */
  percent_back_min: string | null;
  percent_back_max: string | null;
  display: string | null;
}

export interface LoyaltySummaryResponse {
  /** The programme is switched on for this tenant. */
  enabled: boolean;
  display_mode: "points" | "cashback";
  /** Null unless the tenant presents cash back. */
  points_per_currency_unit: number | null;
  currency: string;
  earn_rate: LoyaltyEarnRate | null;
  earn_rules: LoyaltyEarnRule[];
  /** Present only for an authenticated customer. */
  balance: (LoyaltyBalance & { display: string }) | null;
}

export declare class LoyaltyModule {
  constructor(client: DashClient);

  /** The whole programme, plus the caller's balance when signed in. */
  summary(): Promise<LoyaltySummaryResponse>;
}

// =============================================================================
// EARN POINTS TYPES
// =============================================================================

export interface EarnPointsListResponse {
  completed_tasks: string[];
}

export interface EarnPointsCompleteResponse {
  success: boolean;
  task_id: string;
  points_awarded: number;
  points_remaining: number;
}


/**
 * A plan is one ProductSize on one schedule at one discount. Changing size or
 * frequency means moving to a different plan.
 */
export interface ProductSubscriptionPlan {
  /** Prefixed, e.g. `subplan__Z6_LRqxQrBWbLgPR`. Never a number. */
  id: string;
  name: string;
  interval_length: number;
  interval_unit: "days" | "months";
  /** Percent off the size price, as a decimal string (e.g. "15.00"). */
  discount_percent: string;
  /** Perk lines to show on the storefront. */
  features: string[];
  is_active?: boolean;
}

export interface CustomerSubscription {
  /** Prefixed, e.g. `sub__aB3xK9pQrS2tUv`. Never a number. */
  id: string;
  plan_id: string | null;
  plan_name: string;
  plan: ProductSubscriptionPlan | null;
  product: { id: string; name: string; slug: string } | null;
  size: { id: string; label: string } | null;
  payment_profile_id: string | null;
  /** Only set for legacy ARB-backed subscriptions; empty for platform-billed ones. */
  authorize_subscription_id: string;
  status: "active" | "suspended" | "cancelled" | "expired" | "terminated";
  /** Per-cycle charge, as a decimal string. */
  amount: string;
  quantity: number;
  start_date: string | null;
  next_billing_date: string | null;
  billing_cycles_completed: number;
  shipping_address: Record<string, any>;
  created_at: string | null;
}

export interface SubscriptionResponse {
  subscription: CustomerSubscription;
}

export interface SubscriptionListResponse {
  subscriptions: CustomerSubscription[];
}

export interface CreateSubscriptionOptions {
  /** From `size.subscription_plans` on the product payload. */
  planId: string;
  /** A saved card. Subscribing is an account flow, not a cart flow. */
  paymentProfileId: string;
  quantity?: number;
  shippingAddress?: Record<string, any>;
}

export interface ChangeSubscriptionPlanOptions {
  planId: string;
  /** Omit to keep the current quantity. */
  quantity?: number;
  /**
   * Default false: the customer keeps their existing billing day, so a switch
   * cannot defer a charge that is already due. True restarts the clock from
   * today on the new interval.
   */
  resetBillingDate?: boolean;
}

/**
 * A customer's product subscriptions. Billed by the platform against a saved
 * payment profile, not by Authorize.net ARB.
 */
export declare class SubscriptionsModule {
  constructor(client: DashClient);

  /** Every subscription for the signed-in customer, newest first. */
  list(): Promise<SubscriptionListResponse>;

  /** Start a subscription. Requires a signed-in customer and a saved card. */
  create(options: CreateSubscriptionOptions): Promise<SubscriptionResponse>;

  /** Cancel for good. Terminal: `resume` will not bring it back. */
  cancel(subscriptionId: string): Promise<SubscriptionResponse>;

  /** Pause billing, keeping the billing day for when it resumes. */
  pause(subscriptionId: string): Promise<SubscriptionResponse>;

  /** Restart a paused subscription, skipping any date that has passed. */
  resume(subscriptionId: string): Promise<SubscriptionResponse>;

  /** Point future charges at a different saved card. */
  updatePayment(
    subscriptionId: string,
    paymentProfileId: string
  ): Promise<SubscriptionResponse>;

  /** Change size, frequency or quantity by moving to another plan. */
  changePlan(
    subscriptionId: string,
    options: ChangeSubscriptionPlanOptions
  ): Promise<SubscriptionResponse>;
}

export declare class EarnPointsModule {
  constructor(client: DashClient);

  /** List completed earn-point tasks for the authenticated customer */
  list(): Promise<EarnPointsListResponse>;

  /** Mark a social task as completed and award points (requires auth) */
  complete(taskId: string): Promise<EarnPointsCompleteResponse>;
}

// =============================================================================
// FORMS MODULE
// =============================================================================

/**
 * A single field in a dashboard-built form schema.
 * The `type` drives which input widget the React hook renders.
 */
export interface FormFieldOption {
  value: string;
  label: string;
}

export interface FormFieldShowWhen {
  /** Name of the field whose value gates this field's visibility */
  field: string;
  /** Required value for the gate field */
  equals: unknown;
}

export type FormFieldType =
  | "text"
  | "email"
  | "tel"
  | "url"
  | "number"
  | "date"
  | "hidden"
  | "textarea"
  | "select"
  | "multiselect"
  | "checkbox"
  | "radio"
  | "file"
  | "signature";

export interface FormField {
  name: string;
  label: string;
  type: FormFieldType | string;
  required?: boolean;
  required_message?: string;
  placeholder?: string;
  help_text?: string;
  options?: FormFieldOption[];
  show_when?: FormFieldShowWhen | null;
  max_length?: number | null;
  min_length?: number | null;
  /** File-input accept attribute */
  accept?: string;
  /** Signature canvas size hints */
  signature_width?: number;
  signature_height?: number;
  disabled?: boolean;
  [key: string]: any;
}

export interface FormSchema {
  slug: string;
  title: string;
  description: string;
  fields: FormField[];
  success_message?: string;
  redirect_url?: string;
  [key: string]: any;
}

export interface FormGetResponse {
  form: FormSchema;
}

export interface FormSignaturePayload {
  field_name?: string;
  value: string;
}

export interface FormSubmitPayload {
  /** Field-name keyed answers (same shape as FormField.name -> value). */
  answers: Record<string, unknown>;
  /** Optional signature submissions (typed name or `data:image/...`). */
  signatures?: FormSignaturePayload[];
  /** URL of the page that originated the submission. */
  source_url?: string;
}

export interface FormSubmitResponse {
  success: boolean;
  submission_id: string;
  submitted_at: string;
  success_message: string;
  redirect_url: string;
  /** Optional server-computed score (e.g. for screening forms). */
  score?: unknown;
}

export declare class FormsModule {
  constructor(client: DashClient);

  /** Fetch the published form schema for `slug`. */
  get(slug: string): Promise<FormGetResponse>;

  /** Submit answers + signatures to form `slug`. */
  submit(slug: string, payload: FormSubmitPayload): Promise<FormSubmitResponse>;
}

// =============================================================================
// SURVEY MODULE
// =============================================================================

export type SurveyQuestionType =
  | "short_text"
  | "long_text"
  | "radio"
  | "checkbox"
  | "dropdown"
  | "number"
  | "email"
  | "date";

export interface SurveyQuestionOption {
  value: string;
  label: string;
}

export interface SurveyQuestionShowWhen {
  /** Question id this condition depends on. */
  field: string;
  /** Value the referenced question must equal for this question to show. */
  equals: unknown;
}

export interface SurveyQuestion {
  id: string;
  order: number;
  type: SurveyQuestionType | string;
  label: string;
  help_text?: string;
  placeholder?: string;
  required?: boolean;
  /** Present for choice types (radio/checkbox/dropdown). */
  options?: SurveyQuestionOption[];
  show_when?: SurveyQuestionShowWhen | null;
  [key: string]: any;
}

export interface SurveySchema {
  id: string;
  slug: string;
  title: string;
  description: string;
  status: string;
  success_message?: string;
  settings?: Record<string, unknown>;
  questions: SurveyQuestion[];
  [key: string]: any;
}

export interface SurveyGetResponse {
  survey: SurveySchema;
}

export interface SurveyValidateResult {
  valid: boolean;
  /** Maps question id -> reason code ('required' | 'invalid_option' | 'too_long' | 'invalid'). */
  fields: Record<string, string>;
}

export interface SurveySubmitOptions {
  /** URL of the page that originated the submission (defaults to window.location.href). */
  sourceUrl?: string;
  /** Optional respondent identity for anonymous submissions. */
  respondentName?: string;
  respondentEmail?: string;
}

export interface SurveySubmitResponse {
  success: boolean;
  response_id: string;
  success_message: string;
}

export interface LandingSurveyPayload {
  /** Identifies the landing page variant/campaign. */
  campaign?: string;
  ordered?: "yes" | "no" | "";
  source?: string;
  /** 1–5 (Path A only). */
  rating?: number;
  /** Path B multi-select. */
  held_back?: string[];
  /** Path A free text. */
  feedback?: string;
  /** Path B free text. */
  change_mind?: string;
  /** Optional email for anonymous respondents. */
  followup_email?: string;
  /** Defaults to window.location.href in the browser. */
  source_url?: string;
}

export interface LandingSurveySubmitResponse {
  success: boolean;
  response_id: string;
}

export declare class SurveyModule {
  constructor(client: DashClient);

  /** Fetch a published survey's schema/metadata for `slug`. */
  get(slug: string): Promise<SurveyGetResponse>;

  /**
   * Client-side validation against a fetched survey schema (same rules the
   * server enforces). `values` is keyed by question id.
   */
  validate(schema: SurveySchema | SurveyGetResponse, values?: Record<string, unknown>): SurveyValidateResult;

  /**
   * Submit answers (keyed by question id) to survey `slug`. The responding
   * customer is taken from the logged-in Bearer token — not passed here.
   */
  submit(
    slug: string,
    values: Record<string, unknown>,
    options?: SurveySubmitOptions
  ): Promise<SurveySubmitResponse>;

  /**
   * Submit a bespoke "landing survey" (branching quiz) response. Not tied to a
   * dashboard-built schema. Attributed to the logged-in customer via the Bearer
   * token when present, else anonymous.
   */
  submitLanding(payload: LandingSurveyPayload): Promise<LandingSurveySubmitResponse>;
}

// =============================================================================
// PAGE GROUPS MODULE
// =============================================================================

/**
 * Metadata describing a Page Group (a content collection like Services,
 * Industries, Locations, FAQ, etc.). Returned by `pageGroups.list()`.
 */
/**
 * A named image field declared on a Page Group (e.g. "icon", "hero", "cover").
 * Items fill these slots; the resolved images live on `PageGroupItem.images`.
 */
export interface PageGroupImageField {
  /** Slot key used in `item.images[name]` (e.g. "icon") */
  name: string;
  /** Human-readable label for the dashboard */
  label?: string;
}

/**
 * A variant-aware image object for a Page Group named-image slot. Same shape
 * consumed by `<DashImage image={...} />` (WebP variants + LQIP blur-up).
 */
export interface PageGroupImage {
  /** Original source URL */
  url: string;
  /** Tiny base64 blur-up placeholder (may be null until processed) */
  lqip?: string | null;
  /** Whether responsive variants have finished generating */
  variants_ready?: boolean;
  /** Responsive variants by format */
  variants?: {
    webp?: Array<{ width: number; url: string }>;
    avif?: Array<{ width: number; url: string }>;
    [format: string]: Array<{ width: number; url: string }> | undefined;
  };
  /** Alt text configured for this slot, if any */
  alt?: string;
  [key: string]: any;
}

export interface PageGroupSummary {
  id: string;
  /** Human-readable singular name (e.g. "Service") */
  name: string;
  /** Human-readable plural name (e.g. "Services") */
  plural_name?: string;
  /** Storefront slug used in URLs and SDK calls */
  slug: string;
  /** Optional URL pattern for individual items (e.g. "/services/{slug}") */
  singular_path?: string;
  /** Number of published items in this group */
  item_count: number;
  /** Named image slots declared for items of this group */
  image_fields?: PageGroupImageField[];
  [key: string]: any;
}

/**
 * A single published item inside a Page Group.
 *
 * The shape is intentionally loose — Page Groups are user-defined in the
 * dashboard, so `metadata` and `custom_fields` are open-ended. Top-level
 * fields are guaranteed by the storefront API.
 */
export interface PageGroupItem {
  id: string;
  title: string;
  slug: string;
  /** HTML content body (rendered from the dashboard editor) */
  content: string;
  /** Short summary for list/card views */
  excerpt: string;
  featured_image: string | null;
  featured_image_alt?: string;
  /**
   * Named image slots (declared on the group's `image_fields`), keyed by name.
   * Each value is variant-aware and renders with `<DashImage image={...} />`.
   * @example dash.pageGroup("service").get(slug) -> item.images.icon
   */
  images?: Record<string, PageGroupImage>;
  /** Free-form structured fields configured on the group */
  custom_fields: Record<string, any>;
  /** Free-form metadata (status flags, ordering, etc.) */
  metadata: Record<string, any>;
  /** SEO title override (falls back to `title`) */
  seo_title?: string | null;
  seo_description?: string | null;
  seo_keywords?: string | null;
  og_image?: string | null;
  published_at?: string | null;
  created_at?: string;
  [key: string]: any;
}

export interface PageGroupAllOptions {
  /** Max items returned (default: 50) */
  limit?: number;
  /** Pagination offset (default: 0) */
  offset?: number;
}

export interface PageGroupListResponse {
  content_types: PageGroupSummary[];
}

export interface PageGroupItemsResponse {
  content_type: PageGroupSummary;
  items: PageGroupItem[];
  total: number;
}

export interface PageGroupItemResponse {
  item: PageGroupItem;
}

/**
 * Object-spec predicate: each key must equal the item's value.
 * Lookups walk top-level fields, then `metadata`, then `custom_fields`.
 */
export type PageGroupFilterSpec = Record<string, unknown>;

export type PageGroupPredicate =
  | ((item: PageGroupItem) => boolean)
  | PageGroupFilterSpec;

/**
 * Fluent query builder for a single Page Group. Returned by
 * `dash.pageGroup(slug)` and `dash.pageGroups.group(slug)`.
 */
export declare class PageGroup {
  constructor(client: DashClient, slug: string);

  readonly client: DashClient;
  readonly slug: string;

  /** Fetch every published item in this group (paginated). */
  all(options?: PageGroupAllOptions): Promise<PageGroupItemsResponse>;

  /**
   * Filter items in this group using a predicate function or an object
   * spec. Filtering runs client-side after `all()`.
   */
  filter(
    predicate: PageGroupPredicate,
    options?: PageGroupAllOptions,
  ): Promise<PageGroupItem[]>;

  /** Fetch a single published item by its slug. */
  get(itemSlug: string): Promise<PageGroupItemResponse>;

  /** Find the first item matching the predicate, or `null`. */
  find(predicate: PageGroupPredicate): Promise<PageGroupItem | null>;

  /** Count published items (uses pagination metadata). */
  count(): Promise<number>;
}

export declare class PageGroupsModule {
  constructor(client: DashClient);

  /** List every published Page Group (collection metadata, not items). */
  list(): Promise<PageGroupListResponse>;

  /** Get a fluent builder for a specific group. */
  group(slug: string): PageGroup;
}

// =============================================================================
// CONTENT TYPES MODULE (legacy — prefer PageGroupsModule)
// =============================================================================

/**
 * @deprecated Use `dash.pageGroup(slug)` or `dash.pageGroups` instead.
 * Kept for backwards compatibility; will be removed in a future major version.
 */
export declare class ContentTypesModule {
  constructor(client: DashClient);
  list(): Promise<PageGroupListResponse>;
  listItems(typeSlug: string, options?: PageGroupAllOptions): Promise<PageGroupItemsResponse>;
  getItem(typeSlug: string, itemSlug: string): Promise<PageGroupItemResponse>;
}

// =============================================================================
// TRACKING MODULE
// =============================================================================

/** Attribution payload handed to checkout.complete() so an order is source-attributed. */
export interface OrderAttribution {
  visitor_id: string;
  session_id: string;
  ft: Record<string, any>;
  lt: Record<string, any>;
}

/**
 * First-party web analytics — a self-hosted alternative to Google Analytics.
 * Captures pageviews, clicks, sessions, and conversions into your own backend
 * with persistent first/last-touch attribution. Initialize once on page load.
 */
export declare class InsightsModule {
  constructor(client: DashClient);

  /** Start collecting (pageviews + clicks auto-tracked). No-op on the server. */
  init(options?: {
    autoPageviews?: boolean;
    autoClicks?: boolean;
    flushIntervalMs?: number;
  }): { active: boolean };

  /** Stop collecting and flush remaining events. */
  destroy(): void;

  /** Track a pageview (automatic; call manually for SPAs if needed). */
  pageview(path?: string): void;

  /** Track a custom event. */
  track(name: string, props?: Record<string, any>): void;

  /** Associate the visitor with a known customer (e.g. after login). */
  identify(customerId: string, props?: Record<string, any>): void;

  /** Clear the customer association (e.g. on logout). */
  clearIdentity(): void;

  /** Record a client-side conversion (lead/booking/signup goals). */
  conversion(value?: number, props?: Record<string, any>): void;

  /** SPA route-change hook — fires a pageview if the path changed. */
  notifyRouteChange(path?: string): void;

  /** The persistent first-party visitor id. */
  getVisitorId(): string;

  /** The current session id (30-min idle window). */
  getSessionId(): string;

  /** The stored { ft, lt } attribution object. */
  getAttribution(): { ft: Record<string, any>; lt: Record<string, any> };

  /** Compact attribution payload for checkout.complete(). */
  attributionForOrder(): OrderAttribution;

  /** Manually flush buffered events. */
  flush(useBeacon?: boolean): void;
}

export declare class TrackingModule {
  constructor(client: DashClient);

  /**
   * Initialize tracking by fetching org config.
   * Call once on page load: `await dash.tracking.init()`
   */
  init(): Promise<{ active: boolean }>;

  /**
   * Capture a custom event.
   */
  capture(eventName: string, properties?: Record<string, any>): void;

  /**
   * Identify a user for tracking.
   */
  identify(userId: string, properties?: Record<string, any>): void;

  /**
   * Reset the current user identity (e.g. on logout).
   */
  reset(): void;

  /**
   * Set the authenticated customer ID for backend visit linking.
   */
  setCustomer(customerId: string | null): void;

  /**
   * Clear the stored customer ID (e.g. on logout).
   */
  clearCustomer(): void;

  /**
   * Enable automatic pageview tracking for SPA route changes.
   */
  enableAutoPageviews(): void;

  /**
   * Notify tracking of a route change (for Next.js / SPA routers).
   */
  notifyRouteChange(pathname?: string): void;

  /**
   * Set properties on the current user without identifying them.
   */
  setUserProperties(properties: Record<string, any>): void;

  /**
   * Track a pageview.
   */
  pageview(path?: string): void;

  /**
   * Track a storefront visit with UTM parameters.
   */
  trackVisit(options?: { customer_id?: string; session_id?: string }): Promise<{ success: boolean }>;

  optIn(): void;
  optOut(): void;

  isFeatureEnabled(flagKey: string): boolean | string | undefined;

  /**
   * Show or hide the debug overlay.
   */
  debug(show?: boolean): void;

  // ThoughtMetric helpers
  tmEvent(eventName: string, properties?: Record<string, any>): void;
  tmIdentify(customerId: string, properties?: Record<string, any>): void;
  tmPurchase(order: {
    transaction_id: string;
    total_price: number;
    currency?: string;
    subtotal_price?: number;
    total_tax?: number;
    total_shipping?: number;
    total_discounts?: number;
    discount_codes?: string[];
    items?: any[];
  }): void;

  // Meta Pixel helpers
  fbqEvent(eventName: string, params?: Record<string, any>, options?: Record<string, any>): void;
  fbqCustom(eventName: string, params?: Record<string, any>, options?: Record<string, any>): void;
  fbqPageView(): void;
  fbqViewContent(params?: Record<string, any>): void;
  fbqAddToCart(params?: Record<string, any>): void;
  fbqAddToWishlist(params?: Record<string, any>): void;
  fbqInitiateCheckout(params?: Record<string, any>): void;
  fbqAddPaymentInfo(params?: Record<string, any>): void;
  fbqPurchase(params?: Record<string, any>): void;
  fbqSearch(params?: Record<string, any>): void;
  fbqLead(params?: Record<string, any>): void;
  fbqContact(params?: Record<string, any>): void;
  fbqCompleteRegistration(params?: Record<string, any>): void;
  fbqSubscribe(params?: Record<string, any>): void;
}

// =============================================================================
// AFFILIATES MODULE
// =============================================================================

export declare class AffiliatesModule {
  constructor(client: DashClient);

  /**
   * Get the affiliate application form configuration.
   */
  getFormConfig(): Promise<{
    is_active: boolean;
    custom_fields: any[];
    welcome_message: string;
  }>;

  /**
   * Submit an affiliate application.
   */
  apply(data: {
    name: string;
    email: string;
    phone?: string;
    paypal_email?: string;
    custom_fields?: Record<string, any>;
    source_url?: string;
    turnstile_token?: string;
  }): Promise<{ success: boolean; message: string; request_id: string }>;

  /**
   * Get current customer's affiliate status. Requires authentication.
   */
  getMyStatus(): Promise<{
    is_affiliate: boolean;
    has_pending_request: boolean;
    request_status: string | null;
    rejection_reason: string | null;
  }>;

  /**
   * Get affiliate dashboard data. Requires authentication + approved status.
   */
  getMyDashboard(): Promise<{
    tier_name: string;
    commission_rate: number;
    total_orders: number;
    total_revenue: string;
    total_earned: string;
    paypal_email: string;
    discount_codes: any[];
  }>;

  /**
   * Create a discount code as an affiliate.
   */
  createCode(data: { code: string }): Promise<{
    success: boolean;
    message: string;
    discount_code: Record<string, any>;
  }>;

  /**
   * Update affiliate profile (e.g., PayPal email).
   */
  updateProfile(data: { paypal_email?: string }): Promise<{
    success: boolean;
    paypal_email: string;
  }>;

  /**
   * Deactivate one of the affiliate's own discount codes (one-way).
   */
  deactivateCode(codeId: string): Promise<{ success: boolean; message: string }>;

  /**
   * List the current affiliate's product requests.
   */
  listProductRequests(params?: { page?: number }): Promise<{
    requests: any[];
    pagination: Pagination;
  }>;

  /**
   * Submit a new product request.
   */
  createProductRequest(data: {
    full_name: string;
    email: string;
    shipping_address: string;
    platform: string;
    platform_other?: string;
    profile_link?: string;
    follower_count: string;
    kit_type: string;
    kit_other_description?: string;
    content_plan: string;
    expected_sales: string;
    content_links?: string;
    additional_notes?: string;
  }): Promise<{ success: boolean; message: string; request_id: string }>;

  /**
   * Get a single product request by ID.
   */
  getProductRequest(requestId: string): Promise<{ request: Record<string, any> }>;

  /**
   * Update a pending product request.
   */
  updateProductRequest(requestId: string, data: Record<string, any>): Promise<{
    success: boolean;
    message: string;
  }>;
}

// =============================================================================
// REFERRALS MODULE
// =============================================================================

export declare class ReferralsModule {
  constructor(client: DashClient);

  /**
   * Validate a referral secret and get/create a discount code.
   */
  validate(data: {
    secret: string;
    subtotal: string | number;
    /** The shopper's cart. A guest keeps one code per cart instead of sharing one. */
    cart_id?: string;
  }): Promise<{
    valid: boolean;
    referrer_first_name: string;
    code: string;
    is_percentage: boolean;
    rate: string;
    discount_amount: string;
    meetsMinimum: boolean;
    /** Error code if validation failed (e.g. "min_subtotal") */
    error?: string;
  }>;

  /**
   * Get referral dashboard data for the authenticated customer.
   */
  dashboard(): Promise<{
    referral_secret: string;
    referral_link: string;
    total_referrals: number;
    total_points_earned: number;
    points_balance: number;
    recent_referrals: any[];
  }>;
}

// =============================================================================
// MAIN CLIENT
// =============================================================================

/** Result of DashClient.checkHealth(). `ok` is the one flag the gate acts on. */
export interface HealthStatus {
  /** true → serve the site; false → show the maintenance page. */
  ok: boolean;
  /** Did we get any response at all (vs. network error / timeout)? */
  reachable: boolean;
  /** Show a maintenance page (operator maintenance_mode OR backend down)? */
  maintenance: boolean;
  /** Org is locked (billing/suspension). Reported for info; lock still redirects via _fetch. */
  locked: boolean;
  /** "operator" | "timeout" | "unreachable" | "http_5xx" | null */
  reason: string | null;
  /** Operator-supplied maintenance message, when available. */
  message: string | null;
  /** Optional "expected back" hint. */
  until: string | null;
}

export declare class DashClient {
  /**
   * Create a new DashClient instance
   */
  constructor(options: DashClientOptions);

  /** Your API key */
  readonly apiKey: string;

  /** Backend URL */
  readonly baseURL: string;

  /** Products API */
  readonly products: ProductsModule;

  /** Categories API */
  readonly categories: CategoriesModule;

  /** Cart API */
  readonly cart: CartModule;

  /** Pages API */
  readonly pages: PagesModule;

  /** SEO API */
  readonly seo: SeoModule;

  /** Auth API (Customer authentication) */
  readonly auth: AuthModule;

  /** Payment API */
  readonly payment: PaymentModule;

  /** Blog API */
  readonly blog: BlogModule;

  /** Checkout API */
  readonly checkout: CheckoutModule;

  /** Brands API */
  readonly brands: BrandsModule;

  /** Marketing script injection (Klaviyo onsite JS, etc.) */
  readonly marketing: MarketingModule;

  /** Shipping rate lookup, comparison, and tracking */
  readonly shipping: ShippingModule;

  /** Analytics tracking (PostHog, ThoughtMetric, Meta Pixel, visit tracking) */
  readonly tracking: TrackingModule;

  /** First-party web analytics — self-hosted pageviews, clicks, sessions, conversions */
  readonly insights: InsightsModule;

  /** Affiliate program — application, dashboard, codes (storefront-facing) */
  readonly affiliates: AffiliatesModule;

  /** Referral program — validate referral secrets, dashboard */
  readonly referrals: ReferralsModule;
  readonly paymentMethods: PaymentMethodsModule;

  /** File upload utility (contact form attachments, review media) */
  readonly upload: {
    /** Check if a file extension is allowed for upload */
    isAllowed(filename: string): boolean;
    /**
     * Upload a file to the storefront media endpoint.
     * Returns the CDN URL of the uploaded file.
     * @param file - The file to upload
     * @param options - Optional upload options
     * @param options.onProgress - Progress callback receiving upload percentage (0–100)
     */
    file(file: File, options?: { onProgress?: (percent: number) => void }): Promise<{ url: string; name: string }>;
  };

  /** Contact form submission */
  readonly contact: {
    submit(data: {
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
    }): Promise<{ success: boolean; message: string; submission_id: string }>;
  };

  /** Tax calculation API */
  readonly tax: TaxModule;

  /** COA / Lab Reports API */
  readonly coa: CoaModule;

  /** Legal Documents API */
  readonly legal: LegalModule;

  /** Email/Marketing integration (Klaviyo) */
  readonly email: EmailModule;

  /** Media files API */
  readonly media: MediaModule;

  /** Reusable HTML templates managed in dashfordevs Operations */
  readonly htmlTemplates: HtmlTemplatesModule;

  /** Discount Store (loyalty point redemption) */
  readonly discountStore: DiscountStoreModule;

  /** Loyalty programme: earn rules, rate, and the caller's balance */
  readonly loyalty: LoyaltyModule;

  /** Earn Points (social task completion for loyalty points) */
  readonly earnPoints: EarnPointsModule;

  /** Product subscriptions (recurring deliveries of a ProductSize) */
  readonly subscriptions: SubscriptionsModule;

  /**
   * Forms API — dashboard-built intake / contact / lead-capture / signed
   * forms. Pair with `useDashForm` (from `dash4devs/react`) for a
   * Django-template-style hook that owns form state.
   *
   * @example
   * const { form } = await dash.forms.get("contact");
   * await dash.forms.submit("contact", { answers: { email: "..." } });
   */
  readonly forms: FormsModule;
  readonly survey: SurveyModule;

  /**
   * Page Groups API — storefront content collections (Services, Industries,
   * Locations, FAQ, etc.) configured in the dashboard.
   *
   * @example
   * const { items } = await dash.pageGroups.group("services").all();
   */
  readonly pageGroups: PageGroupsModule;

  /**
   * Fluent shortcut: `dash.pageGroup(slug)` ≡ `dash.pageGroups.group(slug)`.
   *
   * @example
   * const { items } = await dash.pageGroup("services").all();
   * const { item }  = await dash.pageGroup("services").get("kitchen-remodel");
   */
  pageGroup(slug: string): PageGroup;

  /**
   * @deprecated Use `pageGroup(slug)` or `pageGroups`.
   * Legacy alias for the same storefront content-type endpoints.
   */
  readonly contentTypes: ContentTypesModule;

  /**
   * Health check - validates API key and returns organization info
   */
  ping(): Promise<PingResponse>;

  /**
   * Timeout-bounded health probe for a maintenance gate. Never throws. `ok:false`
   * means show <MaintenancePage/> (maintenance_mode on, or backend down/5xx/timeout).
   */
  checkHealth(opts?: { timeoutMs?: number }): Promise<HealthStatus>;

  /**
   * Get page data - convenience method for SSR/SSG
   * Fetches all configured data for a page in a single request.
   *
   * @param pathOrName - URL path or page name
   * @param options - Options (use byName: true to lookup by name instead of path)
   *
   * @example
   * // By path (default)
   * const { page, params, global, data } = await dash.getPageData("/products/my-product");
   *
   * @example
   * // By name
   * const { page, global, data } = await dash.getPageData("home", { byName: true });
   */
  getPageData(pathOrName: string, options?: GetPageDataOptions): Promise<PageDataResponse>;

  /**
   * Get global store data (branding, contact info, etc.)
   * This is the data configured in dashboard settings/api-branding.
   *
   * @example
   * const { global } = await dash.getGlobalData();
   * console.log(global.store_name);       // "My Store"
   * console.log(global.logo);             // "https://..."
   * console.log(global.business_email);   // "contact@mystore.com"
   */
  getGlobalData(): Promise<GlobalDataResponse>;

  /** Get the current session ID used for analytics tracking */
  getSessionId(): string;

  /** Manually set the session ID (e.g., from PostHog or your own tracking) */
  setSessionId(id: string): void;
}

export default DashClient;

// =============================================================================
// REVALIDATION HANDLER (Next.js App Router)
// =============================================================================

export interface RevalidateHandlerOptions {
  /** Shared secret that must match between backend and frontend */
  secret: string | undefined;
}

/**
 * Create a Next.js App Router POST handler for on-demand ISR revalidation.
 * Validates a shared secret from the request body, then calls revalidatePath()
 * for each path in the paths array.
 *
 * @example
 * // app/api/revalidate/route.ts
 * import { createRevalidateHandler } from "@/lib/dash4devs";
 * export const POST = createRevalidateHandler({ secret: process.env.REVALIDATE_SECRET });
 */
export function createRevalidateHandler(options: RevalidateHandlerOptions): (request: Request) => Promise<Response>;
