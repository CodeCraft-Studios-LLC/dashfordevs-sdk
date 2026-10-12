/**
 * Admin CRUD module — requires secret key (sk_*)
 *
 * Provides create, update, delete operations for:
 * Products, Categories, Brands, Blog Posts, Reviews, Contact Forms, Orders, Customers, Media
 */

export class AdminModule {
  constructor(client) {
    this.client = client;
  }

  // ─── Products ───────────────────────────────────────────────────────

  async listProducts(options = {}) {
    const params = new URLSearchParams();
    if (options.page) params.set("page", options.page);
    if (options.per_page) params.set("per_page", options.per_page);
    if (options.search) params.set("search", options.search);
    if (options.category) params.set("category", options.category);
    if (options.active !== undefined) params.set("active", options.active);
    const qs = params.toString();
    return this.client._fetch(`${this.client.baseURL}/api/storefront/admin/products${qs ? `?${qs}` : ""}`);
  }

  async getProduct(productId) {
    return this.client._fetch(`${this.client.baseURL}/api/storefront/admin/products/${productId}`);
  }

  async createProduct(data) {
    return this.client._fetch(`${this.client.baseURL}/api/storefront/admin/products`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async updateProduct(productId, data) {
    return this.client._fetch(`${this.client.baseURL}/api/storefront/admin/products/${productId}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  async deleteProduct(productId) {
    return this.client._fetch(`${this.client.baseURL}/api/storefront/admin/products/${productId}`, {
      method: "DELETE",
    });
  }

  async importProducts(data) {
    return this.client._fetch(`${this.client.baseURL}/api/storefront/admin/products/import`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  // ─── Categories ─────────────────────────────────────────────────────

  async listCategories(options = {}) {
    const params = new URLSearchParams();
    if (options.tree) params.set("tree", "true");
    const qs = params.toString();
    return this.client._fetch(`${this.client.baseURL}/api/storefront/admin/categories${qs ? `?${qs}` : ""}`);
  }

  async getCategory(categoryId) {
    return this.client._fetch(`${this.client.baseURL}/api/storefront/admin/categories/${categoryId}`);
  }

  async createCategory(data) {
    return this.client._fetch(`${this.client.baseURL}/api/storefront/admin/categories`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async updateCategory(categoryId, data) {
    return this.client._fetch(`${this.client.baseURL}/api/storefront/admin/categories/${categoryId}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  async deleteCategory(categoryId) {
    return this.client._fetch(`${this.client.baseURL}/api/storefront/admin/categories/${categoryId}`, {
      method: "DELETE",
    });
  }

  async importCategories(data) {
    return this.client._fetch(`${this.client.baseURL}/api/storefront/admin/categories/import`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  // ─── Brands ─────────────────────────────────────────────────────────

  async listBrands() {
    return this.client._fetch(`${this.client.baseURL}/api/storefront/admin/brands`);
  }

  async createBrand(data) {
    return this.client._fetch(`${this.client.baseURL}/api/storefront/admin/brands`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async updateBrand(brandId, data) {
    return this.client._fetch(`${this.client.baseURL}/api/storefront/admin/brands/${brandId}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  async deleteBrand(brandId) {
    return this.client._fetch(`${this.client.baseURL}/api/storefront/admin/brands/${brandId}`, {
      method: "DELETE",
    });
  }

  // ─── Blog ───────────────────────────────────────────────────────────

  async listPosts(options = {}) {
    const params = new URLSearchParams();
    if (options.page) params.set("page", options.page);
    if (options.search) params.set("search", options.search);
    if (options.status) params.set("status", options.status);
    const qs = params.toString();
    return this.client._fetch(`${this.client.baseURL}/api/storefront/admin/blog/posts${qs ? `?${qs}` : ""}`);
  }

  async getPost(postId) {
    return this.client._fetch(`${this.client.baseURL}/api/storefront/admin/blog/posts/${postId}`);
  }

  async createPost(data) {
    return this.client._fetch(`${this.client.baseURL}/api/storefront/admin/blog/posts`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async updatePost(postId, data) {
    return this.client._fetch(`${this.client.baseURL}/api/storefront/admin/blog/posts/${postId}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  async deletePost(postId) {
    return this.client._fetch(`${this.client.baseURL}/api/storefront/admin/blog/posts/${postId}`, {
      method: "DELETE",
    });
  }

  // ─── Reviews ────────────────────────────────────────────────────────

  async listReviews(options = {}) {
    const params = new URLSearchParams();
    if (options.page) params.set("page", options.page);
    if (options.product) params.set("product", options.product);
    if (options.status) params.set("status", options.status);
    const qs = params.toString();
    return this.client._fetch(`${this.client.baseURL}/api/storefront/admin/reviews${qs ? `?${qs}` : ""}`);
  }

  async updateReview(reviewId, data) {
    return this.client._fetch(`${this.client.baseURL}/api/storefront/admin/reviews/${reviewId}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  async deleteReview(reviewId) {
    return this.client._fetch(`${this.client.baseURL}/api/storefront/admin/reviews/${reviewId}`, {
      method: "DELETE",
    });
  }

  // ─── Contact Forms ──────────────────────────────────────────────────

  async listContactForms(options = {}) {
    const params = new URLSearchParams();
    if (options.status) params.set("status", options.status);
    if (options.search) params.set("search", options.search);
    const qs = params.toString();
    return this.client._fetch(`${this.client.baseURL}/api/storefront/admin/contact-forms${qs ? `?${qs}` : ""}`);
  }

  async getContactForm(formId) {
    return this.client._fetch(`${this.client.baseURL}/api/storefront/admin/contact-forms/${formId}`);
  }

  async updateContactForm(formId, data) {
    return this.client._fetch(`${this.client.baseURL}/api/storefront/admin/contact-forms/${formId}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  async deleteContactForm(formId) {
    return this.client._fetch(`${this.client.baseURL}/api/storefront/admin/contact-forms/${formId}`, {
      method: "DELETE",
    });
  }

  async replyContactForm(formId, body) {
    return this.client._fetch(`${this.client.baseURL}/api/storefront/admin/contact-forms/${formId}/reply`, {
      method: "POST",
      body: JSON.stringify({ body }),
    });
  }

  // ─── Orders ─────────────────────────────────────────────────────────

  async listOrders(options = {}) {
    const params = new URLSearchParams();
    if (options.page) params.set("page", options.page);
    if (options.status) params.set("status", options.status);
    if (options.search) params.set("search", options.search);
    const qs = params.toString();
    return this.client._fetch(`${this.client.baseURL}/api/storefront/admin/orders${qs ? `?${qs}` : ""}`);
  }

  async getOrder(orderId) {
    return this.client._fetch(`${this.client.baseURL}/api/storefront/admin/orders/${orderId}`);
  }

  async updateOrder(orderId, data) {
    return this.client._fetch(`${this.client.baseURL}/api/storefront/admin/orders/${orderId}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  // ─── Customers ──────────────────────────────────────────────────────

  async listCustomers(options = {}) {
    const params = new URLSearchParams();
    if (options.page) params.set("page", options.page);
    if (options.search) params.set("search", options.search);
    const qs = params.toString();
    return this.client._fetch(`${this.client.baseURL}/api/storefront/admin/customers${qs ? `?${qs}` : ""}`);
  }

  async getCustomer(customerId) {
    return this.client._fetch(`${this.client.baseURL}/api/storefront/admin/customers/${customerId}`);
  }

  async updateCustomer(customerId, data) {
    return this.client._fetch(`${this.client.baseURL}/api/storefront/admin/customers/${customerId}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  // ─── Media ──────────────────────────────────────────────────────────

  async listMedia(options = {}) {
    const params = new URLSearchParams();
    if (options.folder) params.set("folder", options.folder);
    if (options.search) params.set("search", options.search);
    const qs = params.toString();
    return this.client._fetch(`${this.client.baseURL}/api/storefront/admin/media${qs ? `?${qs}` : ""}`);
  }

  async deleteMedia(mediaId) {
    return this.client._fetch(`${this.client.baseURL}/api/storefront/admin/media/${mediaId}`, {
      method: "DELETE",
    });
  }

  // ─── Emails ─────────────────────────────────────────────────────────

  async sendEmail(data) {
    return this.client._fetch(`${this.client.baseURL}/api/storefront/admin/emails/send`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async listEmailThreads(options = {}) {
    const params = new URLSearchParams();
    if (options.filter) params.set("filter", options.filter);
    if (options.search) params.set("search", options.search);
    const qs = params.toString();
    return this.client._fetch(`${this.client.baseURL}/api/storefront/admin/emails/threads${qs ? `?${qs}` : ""}`);
  }

  async getEmailThread(threadId) {
    return this.client._fetch(`${this.client.baseURL}/api/storefront/admin/emails/threads/${threadId}`);
  }

  // ─── Discount Codes ─────────────────────────────────────────────────

  async listDiscountCodes(options = {}) {
    const params = new URLSearchParams();
    if (options.search) params.set("search", options.search);
    const qs = params.toString();
    return this.client._fetch(`${this.client.baseURL}/api/storefront/admin/discount-codes${qs ? `?${qs}` : ""}`);
  }

  async createDiscountCode(data) {
    return this.client._fetch(`${this.client.baseURL}/api/storefront/admin/discount-codes`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async updateDiscountCode(codeId, data) {
    return this.client._fetch(`${this.client.baseURL}/api/storefront/admin/discount-codes/${codeId}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  async deleteDiscountCode(codeId) {
    return this.client._fetch(`${this.client.baseURL}/api/storefront/admin/discount-codes/${codeId}`, {
      method: "DELETE",
    });
  }

  // ─── Product Variations (Attributes & Options) ──────────────────────

  async listProductVariations(productId) {
    return this.client._fetch(`${this.client.baseURL}/api/storefront/admin/products/${productId}/attributes`);
  }

  async createProductAttribute(productId, data) {
    return this.client._fetch(`${this.client.baseURL}/api/storefront/admin/products/${productId}/attributes`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async updateProductAttribute(productId, attributeId, data) {
    return this.client._fetch(`${this.client.baseURL}/api/storefront/admin/products/${productId}/attributes/${attributeId}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  async deleteProductAttribute(productId, attributeId) {
    return this.client._fetch(`${this.client.baseURL}/api/storefront/admin/products/${productId}/attributes/${attributeId}`, {
      method: "DELETE",
    });
  }

  async createVariation(productId, attributeId, data) {
    return this.client._fetch(`${this.client.baseURL}/api/storefront/admin/products/${productId}/attributes/${attributeId}/options`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async updateVariation(productId, attributeId, optionId, data) {
    return this.client._fetch(`${this.client.baseURL}/api/storefront/admin/products/${productId}/attributes/${attributeId}/options/${optionId}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  async deleteVariation(productId, attributeId, optionId) {
    return this.client._fetch(`${this.client.baseURL}/api/storefront/admin/products/${productId}/attributes/${attributeId}/options/${optionId}`, {
      method: "DELETE",
    });
  }

  // ─── Product Sizes ──────────────────────────────────────────────────

  async listProductSizes(productId) {
    return this.client._fetch(`${this.client.baseURL}/api/storefront/admin/products/${productId}/sizes`);
  }

  async createProductSize(productId, data) {
    return this.client._fetch(`${this.client.baseURL}/api/storefront/admin/products/${productId}/sizes`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async updateProductSize(productId, sizeId, data) {
    return this.client._fetch(`${this.client.baseURL}/api/storefront/admin/products/${productId}/sizes/${sizeId}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  async deleteProductSize(productId, sizeId) {
    return this.client._fetch(`${this.client.baseURL}/api/storefront/admin/products/${productId}/sizes/${sizeId}`, {
      method: "DELETE",
    });
  }

  // ─── Product Files (Lab Reports, etc.) ──────────────────────────────

  async listProductFiles(productId) {
    return this.client._fetch(`${this.client.baseURL}/api/storefront/admin/products/${productId}/files`);
  }

  async deleteProductFile(productId, fileId) {
    return this.client._fetch(`${this.client.baseURL}/api/storefront/admin/products/${productId}/files/${fileId}`, {
      method: "DELETE",
    });
  }

  // ─── Email Replies ──────────────────────────────────────────────────

  async replyToThread(threadId, data) {
    return this.client._fetch(`${this.client.baseURL}/api/storefront/admin/emails/threads/${threadId}/reply`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  // ─── Contact Form Replies ───────────────────────────────────────────

  async listContactFormReplies(formId) {
    return this.client._fetch(`${this.client.baseURL}/api/storefront/admin/contact-forms/${formId}/replies`);
  }

  // ─── Blog Categories ───────────────────────────────────────────────

  async listBlogCategories() {
    return this.client._fetch(`${this.client.baseURL}/api/storefront/admin/blog/categories`);
  }

  async createBlogCategory(data) {
    return this.client._fetch(`${this.client.baseURL}/api/storefront/admin/blog/categories`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async updateBlogCategory(categoryId, data) {
    return this.client._fetch(`${this.client.baseURL}/api/storefront/admin/blog/categories/${categoryId}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  async deleteBlogCategory(categoryId) {
    return this.client._fetch(`${this.client.baseURL}/api/storefront/admin/blog/categories/${categoryId}`, {
      method: "DELETE",
    });
  }
}

export default AdminModule;
