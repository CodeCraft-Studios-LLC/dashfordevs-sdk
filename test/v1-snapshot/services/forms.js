/**
 * Forms Module
 * ------------------------------------------------------------------
 * Storefront-side access to dashboard-built forms (intake, contact,
 * lead capture, signed forms).
 *
 *   import { DashClient } from "dash4devs";
 *   const dash = new DashClient({ apiKey: process.env.DASH4DEVS_KEY });
 *
 *   const { form } = await dash.forms.get("contact");
 *   const result = await dash.forms.submit("contact", {
 *     answers: { first_name: "Jane", email: "jane@example.com", ... },
 *     signatures: [{ field_name: "consent", value: "Jane Doe" }],
 *     source_url: window.location.href,
 *   });
 *
 * The React side (`dash4devs/react`) wraps this with `useDashForm`
 * which exposes Django-template-style field accessors:
 *   const form = useDashForm("contact");
 *   <label>{form.field("first_name").label}</label>
 *   {form.field("first_name").input()}
 *   {form.handleSubmit(onDone)}
 */

export class FormsModule {
  constructor(client) {
    this.client = client;
  }

  /**
   * Fetch the form schema for `slug`.
   *
   * @param {string} slug
   * @returns {Promise<{ form: object }>}
   *
   * The returned `form.fields` is the canonical schema — list of field
   * descriptors with `name`, `label`, `type`, `required`, `options`,
   * `show_when`, etc.
   */
  async get(slug) {
    if (!slug || typeof slug !== "string") {
      throw new Error("forms.get(slug): slug must be a non-empty string");
    }
    const url = `${this.client.baseURL}/api/storefront/forms/${encodeURIComponent(slug)}`;
    return this.client._fetch(url);
  }

  /**
   * Submit answers to the form `slug`.
   *
   * @param {string} slug
   * @param {object} payload
   * @param {Record<string, unknown>} payload.answers           - Field-name keyed answers.
   * @param {Array<{field_name?: string, value: string}>} [payload.signatures]
   * @param {string} [payload.source_url]
   *
   * @returns {Promise<{
   *   success: boolean,
   *   submission_id: string,
   *   submitted_at: string,
   *   success_message: string,
   *   redirect_url: string
   * }>}
   *
   * Server-side validation runs against the form schema. On a 422 the
   * error includes a `fields` map keyed by field-name -> short reason
   * code (`required`, `invalid_option`, `too_long`). The caller can map
   * these to user-facing messages.
   */
  async submit(slug, payload) {
    if (!slug || typeof slug !== "string") {
      throw new Error("forms.submit(slug, payload): slug must be a non-empty string");
    }
    if (!payload || typeof payload !== "object") {
      throw new Error("forms.submit(slug, payload): payload must be an object");
    }
    if (!payload.answers || typeof payload.answers !== "object") {
      throw new Error("forms.submit(slug, payload): payload.answers is required");
    }
    const url = `${this.client.baseURL}/api/storefront/forms/${encodeURIComponent(slug)}/submit`;
    return this.client._fetch(url, {
      method: "POST",
      body: JSON.stringify({
        answers: payload.answers,
        signatures: payload.signatures ?? undefined,
        source_url: payload.source_url ?? undefined,
      }),
    });
  }
}

export default FormsModule;
