/**
 * Survey Module
 * ------------------------------------------------------------------
 * Storefront-side access to dashboard-built surveys. The dashboard owns the
 * survey schema (questions, types, options); storefronts read it via
 * `dash.survey.get(slug)` to build the form, validate locally with
 * `dash.survey.validate(schema, values)`, then submit with
 * `dash.survey.submit(slug, values)`.
 *
 *   import { DashClient } from "dash4devs";
 *   const dash = new DashClient({ apiKey: process.env.DASH4DEVS_KEY });
 *
 *   const { survey } = await dash.survey.get("nps-2026");
 *   const { valid, fields } = dash.survey.validate(survey, values);
 *   if (valid) {
 *     const res = await dash.survey.submit("nps-2026", values);
 *   }
 *
 * The submitting customer is identified from the logged-in customer's Bearer
 * token (added by the client automatically) — you do NOT pass a customer id.
 *
 * Question types: short_text, long_text, radio, checkbox, dropdown, number,
 * email, date. Answers are keyed by question `id`; `checkbox` answers are
 * arrays of option values.
 */

// Types whose answer must be one (or, for checkbox, several) of `options`.
const CHOICE_TYPES = new Set(["radio", "checkbox", "dropdown"]);

export class SurveyModule {
  constructor(client) {
    this.client = client;
  }

  /**
   * Fetch a published survey's schema/metadata for `slug`.
   *
   * @param {string} slug
   * @returns {Promise<{ survey: object }>}
   *
   * `survey.questions` is the canonical schema — a list of question descriptors
   * with `id`, `type`, `label`, `required`, `options`, `placeholder`,
   * `help_text`, and optional `show_when` ({ field, equals }).
   */
  async get(slug) {
    if (!slug || typeof slug !== "string") {
      throw new Error("survey.get(slug): slug must be a non-empty string");
    }
    const url = `${this.client.baseURL}/api/storefront/surveys/${encodeURIComponent(slug)}`;
    return this.client._fetch(url);
  }

  /**
   * Whether a question should be shown given the current answers.
   * Mirrors the server-side `show_when` evaluation.
   */
  _shouldShow(question, values) {
    const cond = question && question.show_when;
    if (!cond || !cond.field) return true;
    return values[cond.field] === cond.equals;
  }

  /**
   * Client-side validation against a fetched survey schema. Runs the same rules
   * the server enforces so you can surface errors before submitting.
   *
   * @param {object} schema  The survey object from `get()` (must have `questions`).
   * @param {Record<string, unknown>} values  Answers keyed by question id.
   * @returns {{ valid: boolean, fields: Record<string, string> }}
   *   `fields` maps question id -> reason code
   *   ('required' | 'invalid_option' | 'too_long' | 'invalid').
   */
  validate(schema, values = {}) {
    const questions = (schema && schema.questions) || (schema && schema.survey && schema.survey.questions) || [];
    const fields = {};

    for (const q of questions) {
      if (!this._shouldShow(q, values)) continue;

      const raw = values[q.id];
      const isEmpty =
        raw === undefined ||
        raw === null ||
        raw === "" ||
        (Array.isArray(raw) && raw.length === 0) ||
        (typeof raw === "string" && raw.trim() === "");

      if (isEmpty) {
        if (q.required) fields[q.id] = "required";
        continue;
      }

      if (CHOICE_TYPES.has(q.type)) {
        const allowed = new Set((q.options || []).map((o) => o.value));
        const vals = q.type === "checkbox" ? (Array.isArray(raw) ? raw : [raw]) : [raw];
        if (vals.some((v) => !allowed.has(v))) fields[q.id] = "invalid_option";
      } else if (q.type === "number") {
        if (Number.isNaN(Number(raw))) fields[q.id] = "invalid";
      } else if (q.type === "email") {
        if (!String(raw).includes("@")) fields[q.id] = "invalid";
      } else if (String(raw).length > 10000) {
        fields[q.id] = "too_long";
      }
    }

    return { valid: Object.keys(fields).length === 0, fields };
  }

  /**
   * Submit answers to the survey `slug`.
   *
   * @param {string} slug
   * @param {Record<string, unknown>} values  Answers keyed by question id.
   * @param {object} [options]
   * @param {string} [options.sourceUrl]        Defaults to the current page URL in the browser.
   * @param {string} [options.respondentName]   Optional identity for anonymous submissions.
   * @param {string} [options.respondentEmail]
   *
   * @returns {Promise<{ success: boolean, response_id: string, success_message: string }>}
   *
   * The customer is attributed from the logged-in Bearer token — not passed here.
   * On a 422 the error's `details.fields` maps question id -> reason code.
   */
  async submit(slug, values, options = {}) {
    if (!slug || typeof slug !== "string") {
      throw new Error("survey.submit(slug, values): slug must be a non-empty string");
    }
    if (!values || typeof values !== "object") {
      throw new Error("survey.submit(slug, values): values must be an object");
    }

    const sourceUrl =
      options.sourceUrl ??
      (typeof window !== "undefined" && window.location ? window.location.href : undefined);

    const url = `${this.client.baseURL}/api/storefront/surveys/${encodeURIComponent(slug)}/submit`;
    return this.client._fetch(url, {
      method: "POST",
      body: JSON.stringify({
        answers: values,
        source_url: sourceUrl,
        respondent_name: options.respondentName ?? undefined,
        respondent_email: options.respondentEmail ?? undefined,
      }),
    });
  }

  /**
   * Submit a "landing survey" response — the bespoke branching quiz used as a
   * discount-for-feedback funnel (age gate -> ordered? -> source ->
   * rating/feedback or held-back/change-mind). Unlike `submit()` this is not
   * tied to a dashboard-built survey schema; the payload fields are fixed.
   *
   * Attributed to the logged-in customer via the Bearer token when present,
   * else anonymous (optionally with a follow-up email). Best-effort — callers
   * typically fire-and-forget and never block the UI on it.
   *
   * @param {object} payload
   * @param {string}   [payload.campaign]        Identifies the landing page variant.
   * @param {"yes"|"no"|""} [payload.ordered]
   * @param {string}   [payload.source]
   * @param {number}   [payload.rating]          1–5 (Path A only).
   * @param {string[]} [payload.held_back]       Path B multi-select.
   * @param {string}   [payload.feedback]        Path A free text.
   * @param {string}   [payload.change_mind]     Path B free text.
   * @param {string}   [payload.followup_email]  Optional email for anonymous respondents.
   * @param {string}   [payload.source_url]      Defaults to the current page URL in the browser.
   * @returns {Promise<{ success: boolean, response_id: string }>}
   */
  async submitLanding(payload = {}) {
    const sourceUrl =
      payload.source_url ??
      (typeof window !== "undefined" && window.location ? window.location.href : undefined);

    const url = `${this.client.baseURL}/api/storefront/landing-survey/submit`;
    return this.client._fetch(url, {
      method: "POST",
      body: JSON.stringify({ ...payload, source_url: sourceUrl }),
    });
  }
}

export default SurveyModule;
