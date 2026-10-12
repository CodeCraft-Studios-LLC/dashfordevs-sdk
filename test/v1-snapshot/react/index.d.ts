import { ReactNode } from "react";
import type { DashClient } from "../index";

// ============================================================================
// Cart Types
// ============================================================================

export interface CartItem {
  id: string;
  product_id: string;
  product_name: string;
  product_slug: string;
  product_image: string | null;
  size_id: string;
  size_label: string;
  quantity: number;
  unit_price: string;
  total_price: string;
  stock_available: number;
}

export interface CartContextType {
  items: CartItem[];
  cartId: string | null;
  itemCount: number;
  totalItemCount: number;
  subtotal: string;
  isLoading: boolean;
  addItem: (productId: string, sizeId: string, quantity?: number) => Promise<any>;
  updateItem: (sizeId: string, quantity: number) => Promise<void>;
  removeItem: (sizeId: string) => Promise<void>;
  clearCart: () => Promise<void>;
  refreshCart: () => Promise<void>;
  transferToUser: (authToken?: string) => Promise<void>;
}

export interface CartProviderProps {
  children: ReactNode;
  client: DashClient;
  storageKey?: string;
}

export function CartProvider(props: CartProviderProps): JSX.Element;
export function useCart(): CartContextType;

// ============================================================================
// Auth Types
// ============================================================================

export interface Customer {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  emailVerified: boolean;
}

export interface AuthContextType {
  customer: Customer | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<any>;
  register: (email: string, password: string, additionalData?: Record<string, any>) => Promise<any>;
  requestOTP: (email: string) => Promise<any>;
  loginWithOTP: (email: string, code: string) => Promise<any>;
  logout: () => Promise<void>;
  updateProfile: (data: Partial<Customer>) => Promise<any>;
  refreshProfile: () => Promise<void>;
}

export interface AuthProviderProps {
  children: ReactNode;
  client: DashClient;
  tokenKey?: string;
  customerKey?: string;
  onLogin?: (customer: Customer) => void;
  onLogout?: () => void;
}

export function AuthProvider(props: AuthProviderProps): JSX.Element;
export function useAuth(): AuthContextType;

// ============================================================================
// Combined Provider
// ============================================================================

export interface DashProviderProps {
  children: ReactNode;
  client: DashClient;
}

export function DashProvider(props: DashProviderProps): JSX.Element;
export function useDash(): { client: DashClient };

// ============================================================================
// DashImage
// ============================================================================

export interface DashImageVariant {
  width: number;
  url: string;
}

export interface DashImageData {
  url: string;
  lqip?: string | null;
  variants_ready?: boolean;
  variants?: {
    webp?: DashImageVariant[];
    avif?: DashImageVariant[];
  };
  width?: number;
  height?: number;
}

export interface DashImageProps extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, "src"> {
  /** Pre-generated responsive image data (variants + LQIP). Preferred. */
  image?: DashImageData | null | undefined;
  /**
   * Bare image URL fallback so <DashImage> is a drop-in for <img>/<Image>.
   * Used only when `image` is not supplied; renders the original (no variant
   * srcset) until variant data is available for that url.
   */
  src?: string | null;
  alt?: string;
  sizes?: string;
  className?: string;
  style?: React.CSSProperties;
  priority?: boolean;
  noBlur?: boolean;
  fill?: boolean;
}

export function DashImage(props: DashImageProps): JSX.Element | null;

// ============================================================================
// SignaturePad
// ============================================================================

export interface SignaturePadHandle {
  /** Wipe the canvas and emit "" to onChange. */
  clear: () => void;
  /** True if no strokes have been drawn since the last clear. */
  isEmpty: () => boolean;
  /** Current canvas as a base64 PNG data URL. */
  toDataURL: () => string;
}

export interface SignaturePadProps {
  /** Current value (base64 PNG data URL, or "" for empty). */
  value?: string;
  /** Fired with the new data URL when the user finishes a stroke. */
  onChange?: (value: string) => void;
  /** CSS pixel width of the canvas (drawing buffer scales for HiDPI). */
  width?: number;
  /** CSS pixel height of the canvas. */
  height?: number;
  className?: string;
  style?: React.CSSProperties;
  strokeColor?: string;
  backgroundColor?: string;
  disabled?: boolean;
  clearLabel?: string;
  placeholder?: string;
  signedLabel?: string;
  showStatus?: boolean;
}

export const SignaturePad: React.ForwardRefExoticComponent<
  SignaturePadProps & React.RefAttributes<SignaturePadHandle>
>;

// ============================================================================
// useDashForm
// ============================================================================

export interface DashFormFieldAccessor {
  name: string;
  label: string;
  helpText?: string;
  type: string;
  required: boolean;
  options: { value: string; label: string }[];
  visible: boolean;
  value: unknown;
  set: (value: unknown) => void;
  error: string | null;
  touched: boolean;
  /** Render a fully-configured input element for this field. */
  input: (extraProps?: Record<string, any>) => React.ReactNode;
  /** True if the form schema has no field with this name. */
  missing: boolean;
}

export interface UseDashFormOptions {
  /** Explicit DashClient (defaults to the one from <DashProvider>). */
  client?: DashClient;
  /** Pre-fill values keyed by field name. */
  initialValues?: Record<string, unknown>;
  /** Fired after a successful submit with the API response. */
  onSuccess?: (response: any) => void;
  /** Fired after a failed submit with the thrown error. */
  onError?: (err: any) => void;
}

export interface UseDashFormResult {
  // Schema
  slug: string;
  title: string;
  description: string;
  fields: any[];

  // Lifecycle
  loading: boolean;
  loadError: string | null;

  // Field access (Django-template style)
  field: (name: string) => DashFormFieldAccessor;

  // Submission
  handleSubmit: (
    onSuccess?: (response: any) => void,
  ) => (e?: React.FormEvent) => Promise<void>;
  submitting: boolean;
  success: boolean;
  successMessage: string;
  redirectUrl: string;
  formError: string | null;
  score: unknown;

  // Raw state (escape hatch)
  values: Record<string, unknown>;
  errors: Record<string, string>;
  touched: Record<string, boolean>;
  setFieldValue: (name: string, value: unknown) => void;
  setValues: React.Dispatch<React.SetStateAction<Record<string, unknown>>>;
  reset: () => void;
}

export function useDashForm(
  slug: string,
  options?: UseDashFormOptions,
): UseDashFormResult;

// ============================================================================
// MaintenancePage
// ============================================================================

export interface MaintenancePageProps {
  /** Small brand label above the title (ignored if `logoUrl` is set). */
  brand?: string;
  /** Headline. Defaults to "We'll be right back". */
  title?: string;
  /** Body copy. Falls back to a generic maintenance message. */
  message?: string | null;
  /** Optional "expected back" hint. */
  until?: string | null;
  /** Logo image URL shown above the title. */
  logoUrl?: string | null;
  /** Support mailto shown at the bottom. */
  supportEmail?: string | null;
  /** Accent color for the dot / brand / links. Defaults to indigo. */
  accent?: string;
  /** Auto-reload interval in seconds so visitors recover hands-free. 0 disables. Default 30. */
  refreshSeconds?: number;
}

/**
 * Self-contained "we'll be right back" page to render when checkHealth() returns
 * `ok: false`. Inline-styled + server-renderable, so it works even if the CDN /
 * stylesheets are down.
 */
export function MaintenancePage(props?: MaintenancePageProps): JSX.Element;
