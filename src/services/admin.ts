/**
 * Admin CRUD module - secret keys (sk_*) only, server-side only.
 *
 * `dash.admin` exists only when the client was created with an sk_ key, and
 * an sk_ key cannot be used in a browser (the constructor throws).
 *
 * Several list endpoints take `search` as a query parameter (orders,
 * customers, contact forms). Searching by email or name puts that value in
 * the URL and therefore in server access logs; the paths are fixed by the API
 * contract, so prefer searching by order number or id where you can.
 */

import type { DashClient } from "../client.js";

type Q = Record<string, string | number | boolean | undefined>;
type Data = Record<string, any>;

function qs(params: Q, keys: string[]): string {
  const p = new URLSearchParams();
  for (const k of keys) {
    const v = params[k];
    if (k === "active") {
      if (v !== undefined) p.set(k, String(v));
    } else if (v) {
      p.set(k, String(v));
    }
  }
  const s = p.toString();
  return s ? `?${s}` : "";
}

export class AdminModule {
  client: DashClient;
  constructor(client: DashClient) {
    this.client = client;
  }

  _u(path: string): string {
    return `${this.client.baseURL}/api/storefront/admin/${path}`;
  }
  _get(path: string): Promise<any> {
    return this.client._fetch(this._u(path));
  }
  _send(path: string, method: string, data?: unknown): Promise<any> {
    const init: Record<string, any> = { method };
    if (data !== undefined) init.body = JSON.stringify(data);
    return this.client._fetch(this._u(path), init);
  }

  // ─── Products ───────────────────────────────────────────────────────
  listProducts(options: { page?: number; per_page?: number; search?: string; category?: string; active?: boolean } = {}) {
    return this._get(`products${qs(options, ["page", "per_page", "search", "category", "active"])}`);
  }
  getProduct(productId: string) {
    return this._get(`products/${productId}`);
  }
  createProduct(data: Data) {
    return this._send("products", "POST", data);
  }
  updateProduct(productId: string, data: Data) {
    return this._send(`products/${productId}`, "PUT", data);
  }
  deleteProduct(productId: string) {
    return this._send(`products/${productId}`, "DELETE");
  }
  importProducts(data: Data) {
    return this._send("products/import", "POST", data);
  }

  // ─── Categories ─────────────────────────────────────────────────────
  listCategories(options: { tree?: boolean } = {}) {
    return this._get(`categories${options.tree ? "?tree=true" : ""}`);
  }
  getCategory(categoryId: string) {
    return this._get(`categories/${categoryId}`);
  }
  createCategory(data: Data) {
    return this._send("categories", "POST", data);
  }
  updateCategory(categoryId: string, data: Data) {
    return this._send(`categories/${categoryId}`, "PUT", data);
  }
  deleteCategory(categoryId: string) {
    return this._send(`categories/${categoryId}`, "DELETE");
  }
  importCategories(data: Data) {
    return this._send("categories/import", "POST", data);
  }

  // ─── Brands ─────────────────────────────────────────────────────────
  listBrands() {
    return this._get("brands");
  }
  createBrand(data: Data) {
    return this._send("brands", "POST", data);
  }
  updateBrand(brandId: string, data: Data) {
    return this._send(`brands/${brandId}`, "PUT", data);
  }
  deleteBrand(brandId: string) {
    return this._send(`brands/${brandId}`, "DELETE");
  }

  // ─── Blog ───────────────────────────────────────────────────────────
  listPosts(options: { page?: number; search?: string; status?: string } = {}) {
    return this._get(`blog/posts${qs(options, ["page", "search", "status"])}`);
  }
  getPost(postId: string) {
    return this._get(`blog/posts/${postId}`);
  }
  createPost(data: Data) {
    return this._send("blog/posts", "POST", data);
  }
  updatePost(postId: string, data: Data) {
    return this._send(`blog/posts/${postId}`, "PUT", data);
  }
  deletePost(postId: string) {
    return this._send(`blog/posts/${postId}`, "DELETE");
  }

  // ─── Reviews ────────────────────────────────────────────────────────
  listReviews(options: { page?: number; product?: string; status?: string } = {}) {
    return this._get(`reviews${qs(options, ["page", "product", "status"])}`);
  }
  updateReview(reviewId: string, data: Data) {
    return this._send(`reviews/${reviewId}`, "PUT", data);
  }
  deleteReview(reviewId: string) {
    return this._send(`reviews/${reviewId}`, "DELETE");
  }

  // ─── Contact forms ──────────────────────────────────────────────────
  listContactForms(options: { status?: string; search?: string } = {}) {
    return this._get(`contact-forms${qs(options, ["status", "search"])}`);
  }
  getContactForm(formId: string) {
    return this._get(`contact-forms/${formId}`);
  }
  updateContactForm(formId: string, data: Data) {
    return this._send(`contact-forms/${formId}`, "PUT", data);
  }
  deleteContactForm(formId: string) {
    return this._send(`contact-forms/${formId}`, "DELETE");
  }
  replyContactForm(formId: string, body: string) {
    return this._send(`contact-forms/${formId}/reply`, "POST", { body });
  }
  listContactFormReplies(formId: string) {
    return this._get(`contact-forms/${formId}/replies`);
  }

  // ─── Orders ─────────────────────────────────────────────────────────
  listOrders(options: { page?: number; status?: string; search?: string } = {}) {
    return this._get(`orders${qs(options, ["page", "status", "search"])}`);
  }
  getOrder(orderId: string) {
    return this._get(`orders/${orderId}`);
  }
  updateOrder(orderId: string, data: Data) {
    return this._send(`orders/${orderId}`, "PUT", data);
  }

  // ─── Customers ──────────────────────────────────────────────────────
  listCustomers(options: { page?: number; search?: string } = {}) {
    return this._get(`customers${qs(options, ["page", "search"])}`);
  }
  getCustomer(customerId: string) {
    return this._get(`customers/${customerId}`);
  }
  updateCustomer(customerId: string, data: Data) {
    return this._send(`customers/${customerId}`, "PUT", data);
  }

  // ─── Media ──────────────────────────────────────────────────────────
  listMedia(options: { folder?: string; search?: string } = {}) {
    return this._get(`media${qs(options, ["folder", "search"])}`);
  }
  deleteMedia(mediaId: string) {
    return this._send(`media/${mediaId}`, "DELETE");
  }

  // ─── Emails ─────────────────────────────────────────────────────────
  sendEmail(data: Data) {
    return this._send("emails/send", "POST", data);
  }
  listEmailThreads(options: { filter?: string; search?: string } = {}) {
    return this._get(`emails/threads${qs(options, ["filter", "search"])}`);
  }
  getEmailThread(threadId: string) {
    return this._get(`emails/threads/${threadId}`);
  }
  replyToThread(threadId: string, data: Data) {
    return this._send(`emails/threads/${threadId}/reply`, "POST", data);
  }

  // ─── Discount codes ─────────────────────────────────────────────────
  listDiscountCodes(options: { search?: string } = {}) {
    return this._get(`discount-codes${qs(options, ["search"])}`);
  }
  createDiscountCode(data: Data) {
    return this._send("discount-codes", "POST", data);
  }
  updateDiscountCode(codeId: string, data: Data) {
    return this._send(`discount-codes/${codeId}`, "PUT", data);
  }
  deleteDiscountCode(codeId: string) {
    return this._send(`discount-codes/${codeId}`, "DELETE");
  }

  // ─── Product attributes & options ───────────────────────────────────
  listProductVariations(productId: string) {
    return this._get(`products/${productId}/attributes`);
  }
  createProductAttribute(productId: string, data: Data) {
    return this._send(`products/${productId}/attributes`, "POST", data);
  }
  updateProductAttribute(productId: string, attributeId: string, data: Data) {
    return this._send(`products/${productId}/attributes/${attributeId}`, "PUT", data);
  }
  deleteProductAttribute(productId: string, attributeId: string) {
    return this._send(`products/${productId}/attributes/${attributeId}`, "DELETE");
  }
  createVariation(productId: string, attributeId: string, data: Data) {
    return this._send(`products/${productId}/attributes/${attributeId}/options`, "POST", data);
  }
  updateVariation(productId: string, attributeId: string, optionId: string, data: Data) {
    return this._send(`products/${productId}/attributes/${attributeId}/options/${optionId}`, "PUT", data);
  }
  deleteVariation(productId: string, attributeId: string, optionId: string) {
    return this._send(`products/${productId}/attributes/${attributeId}/options/${optionId}`, "DELETE");
  }

  // ─── Product sizes ──────────────────────────────────────────────────
  listProductSizes(productId: string) {
    return this._get(`products/${productId}/sizes`);
  }
  createProductSize(productId: string, data: Data) {
    return this._send(`products/${productId}/sizes`, "POST", data);
  }
  updateProductSize(productId: string, sizeId: string, data: Data) {
    return this._send(`products/${productId}/sizes/${sizeId}`, "PUT", data);
  }
  deleteProductSize(productId: string, sizeId: string) {
    return this._send(`products/${productId}/sizes/${sizeId}`, "DELETE");
  }

  // ─── Product files ──────────────────────────────────────────────────
  listProductFiles(productId: string) {
    return this._get(`products/${productId}/files`);
  }
  deleteProductFile(productId: string, fileId: string) {
    return this._send(`products/${productId}/files/${fileId}`, "DELETE");
  }

  // ─── Blog categories ────────────────────────────────────────────────
  listBlogCategories() {
    return this._get("blog/categories");
  }
  createBlogCategory(data: Data) {
    return this._send("blog/categories", "POST", data);
  }
  updateBlogCategory(categoryId: string, data: Data) {
    return this._send(`blog/categories/${categoryId}`, "PUT", data);
  }
  deleteBlogCategory(categoryId: string) {
    return this._send(`blog/categories/${categoryId}`, "DELETE");
  }
}

export default AdminModule;
