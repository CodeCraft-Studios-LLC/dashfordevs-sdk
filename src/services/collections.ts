/**
 * Dashboard-built content and input: page groups (and the legacy content-types
 * alias), forms and surveys. Each mirrors its v1 file.
 */

import type { DashClient } from "../client.js";
import type {
  FormGetResponse,
  FormSubmitPayload,
  FormSubmitResponse,
  LandingSurveyPayload,
  LandingSurveySubmitResponse,
  PageGroupAllOptions,
  PageGroupItem,
  PageGroupItemResponse,
  PageGroupItemsResponse,
  PageGroupListResponse,
  PageGroupPredicate,
  SurveyGetResponse,
  SurveySchema,
  SurveySubmitOptions,
  SurveySubmitResponse,
  SurveyValidateResult,
} from "../types.js";

// =============================================================================
// Page groups
// =============================================================================

/**
 * Fluent query builder for one Page Group (a content collection).
 * Returned by `dash.pageGroup(slug)` and `dash.pageGroups.group(slug)`.
 */
export class PageGroup {
  readonly client: DashClient;
  readonly slug: string;

  constructor(client: DashClient, slug: string) {
    if (!slug || typeof slug !== "string") {
      throw new Error("pageGroup(slug): slug must be a non-empty string");
    }
    this.client = client;
    this.slug = slug;
  }

  /** Every published item in this group (paginated). */
  async all(options: PageGroupAllOptions = {}): Promise<PageGroupItemsResponse> {
    const params = new URLSearchParams();
    if (options.limit) params.append("limit", String(options.limit));
    if (options.offset) params.append("offset", String(options.offset));
    const qs = params.toString();
    const url = `${this.client.baseURL}/api/storefront/content-types/${encodeURIComponent(this.slug)}${qs ? `?${qs}` : ""}`;
    return this.client._fetch(url);
  }

  /** Filter items client-side with a predicate or an object spec (top-level, then metadata, then custom_fields). */
  async filter(predicate: PageGroupPredicate, options: PageGroupAllOptions = {}): Promise<PageGroupItem[]> {
    const { items = [] } = await this.all(options);

    if (typeof predicate === "function") {
      return items.filter(predicate as (item: PageGroupItem) => boolean);
    }

    if (predicate && typeof predicate === "object") {
      const entries = Object.entries(predicate);
      return items.filter((item: any) => {
        for (const [key, want] of entries) {
          const got = item?.[key] ?? item?.metadata?.[key] ?? item?.custom_fields?.[key];
          if (got !== want) return false;
        }
        return true;
      });
    }

    return items;
  }

  /** One published item by slug. */
  async get(itemSlug: string): Promise<PageGroupItemResponse> {
    if (!itemSlug || typeof itemSlug !== "string") {
      throw new Error("pageGroup.get(itemSlug): itemSlug must be a non-empty string");
    }
    const url = `${this.client.baseURL}/api/storefront/content-types/${encodeURIComponent(this.slug)}/${encodeURIComponent(itemSlug)}`;
    return this.client._fetch(url);
  }

  /** First item matching the predicate, or null. */
  async find(predicate: PageGroupPredicate): Promise<PageGroupItem | null> {
    const matches = await this.filter(predicate);
    return matches[0] ?? null;
  }

  /** Published item count (from pagination metadata). */
  async count(): Promise<number> {
    const { total = 0 } = await this.all({ limit: 1 });
    return total;
  }
}

/** `dash.pageGroups` - most callers use the `dash.pageGroup(slug)` shortcut. */
export class PageGroupsModule {
  client: DashClient;
  constructor(client: DashClient) {
    this.client = client;
  }

  /** Every published Page Group (collection metadata, not items). */
  async list(): Promise<PageGroupListResponse> {
    const url = `${this.client.baseURL}/api/storefront/content-types`;
    return this.client._fetch(url);
  }

  /** A fluent builder for one group. */
  group(slug: string): PageGroup {
    return new PageGroup(this.client, slug);
  }
}

/**
 * @deprecated Use `dash.pageGroup(slug)` or `dash.pageGroups`. Same endpoints.
 */
export class ContentTypesModule {
  client: DashClient;
  constructor(client: DashClient) {
    this.client = client;
  }

  async list(): Promise<PageGroupListResponse> {
    const url = `${this.client.baseURL}/api/storefront/content-types`;
    return this.client._fetch(url);
  }

  async listItems(typeSlug: string, options: PageGroupAllOptions = {}): Promise<PageGroupItemsResponse> {
    const params = new URLSearchParams();
    if (options.limit) params.append("limit", String(options.limit));
    if (options.offset) params.append("offset", String(options.offset));
    const qs = params.toString();
    const url = `${this.client.baseURL}/api/storefront/content-types/${encodeURIComponent(typeSlug)}${qs ? `?${qs}` : ""}`;
    return this.client._fetch(url);
  }

  async getItem(typeSlug: string, itemSlug: string): Promise<PageGroupItemResponse> {
    const url = `${this.client.baseURL}/api/storefront/content-types/${encodeURIComponent(typeSlug)}/${encodeURIComponent(itemSlug)}`;
    return this.client._fetch(url);
  }
}

// =============================================================================
// Forms
// =============================================================================

export class FormsModule {
  client: DashClient;
  constructor(client: DashClient) {
    this.client = client;
  }

  /** The published form schema for `slug`. */
  async get(slug: string): Promise<FormGetResponse> {
    if (!slug || typeof slug !== "string") {
      throw new Error("forms.get(slug): slug must be a non-empty string");
    }
    const url = `${this.client.baseURL}/api/storefront/forms/${encodeURIComponent(slug)}`;
    return this.client._fetch(url);
  }

  /**
   * Submit answers (+ signatures) to form `slug`. A 422 rejects with a
   * DashApiError whose `fields` maps field name -> reason code.
   */
  async submit(slug: string, payload: FormSubmitPayload): Promise<FormSubmitResponse> {
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

// =============================================================================
// Surveys
// =============================================================================

const CHOICE_TYPES = new Set(["radio", "checkbox", "dropdown"]);

export class SurveyModule {
  client: DashClient;
  constructor(client: DashClient) {
    this.client = client;
  }

  /** A published survey's schema for `slug`. */
  async get(slug: string): Promise<SurveyGetResponse> {
    if (!slug || typeof slug !== "string") {
      throw new Error("survey.get(slug): slug must be a non-empty string");
    }
    const url = `${this.client.baseURL}/api/storefront/surveys/${encodeURIComponent(slug)}`;
    return this.client._fetch(url);
  }

  /** Whether a question is shown given the current answers (mirrors the server's show_when). */
  _shouldShow(question: any, values: Record<string, unknown>): boolean {
    const cond = question && question.show_when;
    if (!cond || !cond.field) return true;
    return values[cond.field] === cond.equals;
  }

  /** Client-side validation with the server's rules: 'required' | 'invalid_option' | 'too_long' | 'invalid'. */
  validate(schema: SurveySchema | SurveyGetResponse, values: Record<string, unknown> = {}): SurveyValidateResult {
    const s: any = schema;
    const questions: any[] = (s && s.questions) || (s && s.survey && s.survey.questions) || [];
    const fields: Record<string, string> = {};

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
        const allowed = new Set((q.options || []).map((o: any) => o.value));
        const vals = q.type === "checkbox" ? (Array.isArray(raw) ? raw : [raw]) : [raw];
        if (vals.some((v: unknown) => !allowed.has(v))) fields[q.id] = "invalid_option";
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

  /** Submit answers keyed by question id. The customer comes from the Bearer token. */
  async submit(
    slug: string,
    values: Record<string, unknown>,
    options: SurveySubmitOptions = {}
  ): Promise<SurveySubmitResponse> {
    if (!slug || typeof slug !== "string") {
      throw new Error("survey.submit(slug, values): slug must be a non-empty string");
    }
    if (!values || typeof values !== "object") {
      throw new Error("survey.submit(slug, values): values must be an object");
    }

    const sourceUrl =
      options.sourceUrl ?? (typeof window !== "undefined" && window.location ? window.location.href : undefined);

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

  /** The bespoke landing-survey (branching quiz) submission. Best-effort. */
  async submitLanding(payload: LandingSurveyPayload = {}): Promise<LandingSurveySubmitResponse> {
    const sourceUrl =
      payload.source_url ?? (typeof window !== "undefined" && window.location ? window.location.href : undefined);

    const url = `${this.client.baseURL}/api/storefront/landing-survey/submit`;
    return this.client._fetch(url, {
      method: "POST",
      body: JSON.stringify({ ...payload, source_url: sourceUrl }),
    });
  }
}
