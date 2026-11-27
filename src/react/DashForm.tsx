"use client";

/**
 * <DashForm slug="new-client-intake" /> - a form built on forms.dashfordevs.com,
 * drawn whole: every field's label, input, help and error, the button, and what
 * the person reads once it is sent.
 *
 *   <DashForm
 *     slug="new-client-intake"
 *     onSubmit={(answers) => {}}     // just before sending; return false to stop
 *     onSuccess={(result) => {}}     // { submission_id, success_message, redirect_url }
 *     onError={(error) => {}}        // DashApiError: message, and fields {name: reason}
 *   />
 *
 * Needs a <DashProvider> above it, or `client={dash}`.
 *
 * It carries layout only (a column, a gap), no colours and no fonts: the form
 * should look like the site it is on. Every part has a class name to style
 * (dash-form, dash-form-field, dash-form-label, dash-form-input,
 * dash-form-help, dash-form-error, dash-form-submit, dash-form-success,
 * dash-form-text) and `classNames` adds yours to any of them (Tailwind, CSS
 * modules). For a layout of your own, use `useDashForm` and place each input
 * yourself.
 *
 * Fields the form does not show (a question that depends on another answer)
 * are left out and never sent. A signed-in customer's answers go under their
 * account; otherwise the form's Email field says whose they are.
 */

import React from "react";
import type { DashClient } from "../client.js";
import { useDashForm } from "./useDashForm.js";

export type DashFormPart =
  | "form"
  | "title"
  | "description"
  | "field"
  | "label"
  | "input"
  | "help"
  | "error"
  | "text"
  | "submit"
  | "success"
  | "formError";

export interface DashFormProps {
  /** The form's address, from forms.dashfordevs.com. */
  slug: string;
  client?: DashClient;
  initialValues?: Record<string, unknown>;
  /** Called with the answers just before they are sent. Return false (or a promise of it) to stop. */
  onSubmit?: (answers: Record<string, unknown>) => boolean | void | Promise<boolean | void>;
  onSuccess?: (response: any) => void;
  onError?: (error: any) => void;
  /** The button's words. Default "Send". */
  submitLabel?: string;
  /** Show the form's own name and description above it. Default true. */
  heading?: boolean;
  /** Go to the form's redirect address once sent, when it has one. Default true. */
  redirect?: boolean;
  className?: string;
  classNames?: Partial<Record<DashFormPart, string>>;
  style?: React.CSSProperties;
  /** Shown while the form is fetched. Default: nothing. */
  loading?: React.ReactNode;
  /** Replaces what is shown once sent (default: the form's own message). */
  renderSuccess?: (message: string, response: any) => React.ReactNode;
}

const NAMES: Record<DashFormPart, string> = {
  form: "dash-form",
  title: "dash-form-title",
  description: "dash-form-description",
  field: "dash-form-field",
  label: "dash-form-label",
  input: "dash-form-input",
  help: "dash-form-help",
  error: "dash-form-error",
  text: "dash-form-text",
  submit: "dash-form-submit",
  success: "dash-form-success",
  formError: "dash-form-error dash-form-error-form",
};

// What the API's reason codes mean to the person filling the form in.
const REASONS: Record<string, string> = {
  required: "Required",
  invalid: "That does not look right",
  invalid_option: "Pick one of the choices",
  too_long: "Too long",
  too_short: "Too short",
};

const COLUMN: React.CSSProperties = { display: "flex", flexDirection: "column", gap: "1rem" };
const FIELD: React.CSSProperties = { display: "flex", flexDirection: "column", gap: "0.375rem" };
const TICK: React.CSSProperties = { display: "flex", alignItems: "flex-start", gap: "0.5rem" };

export function DashForm({
  slug,
  client,
  initialValues,
  onSubmit,
  onSuccess,
  onError,
  submitLabel = "Send",
  heading = true,
  redirect = true,
  className,
  classNames = {},
  style,
  loading = null,
  renderSuccess,
}: DashFormProps): React.JSX.Element | null {
  const [sent, setSent] = React.useState<any>(null);
  const form = useDashForm(slug, {
    client,
    initialValues,
    onSubmit,
    onError,
    onSuccess: (response: any) => {
      setSent(response ?? {});
      if (onSuccess) onSuccess(response);
      const to = response?.redirect_url;
      if (redirect && to && typeof window !== "undefined") window.location.assign(to);
    },
  });

  const cls = (part: DashFormPart, extra?: string) => [NAMES[part], classNames[part], extra].filter(Boolean).join(" ");

  if (form.loading) return <>{loading}</>;
  if (form.loadError) {
    return (
      <p role="alert" className={cls("formError")}>
        This form could not be loaded.
      </p>
    );
  }

  if (form.success) {
    const message = sent?.success_message || form.successMessage || "Thanks. We got it.";
    return (
      <div role="status" className={cls("success", className)} style={style}>
        {renderSuccess ? renderSuccess(message, sent) : <p>{message}</p>}
      </div>
    );
  }

  return (
    <form onSubmit={form.handleSubmit()} noValidate className={cls("form", className)} style={{ ...COLUMN, ...style }}>
      {heading && form.title ? <h2 className={cls("title")}>{form.title}</h2> : null}
      {heading && form.description ? <p className={cls("description")}>{form.description}</p> : null}

      {form.fields.map((def: any) => {
        if (def.type === "hidden") return null;
        if (def.type === "heading") {
          // Words between questions. Shown under the same rule as a question that depends on another.
          const condition = def.show_when;
          if (condition && condition.field && form.values[condition.field] !== condition.equals) return null;
          return (
            <div key={def.name} className={cls("text")}>
              <h3>{def.label}</h3>
              {def.content ? <p style={{ whiteSpace: "pre-wrap" }}>{def.content}</p> : null}
            </div>
          );
        }
        const field = form.field(def.name);
        if (!field.visible) return null;
        const reason = field.error;
        const error = reason ? (reason === "required" && def.required_message) || REASONS[reason] || reason : null;
        const described = [def.help_text ? `${def.name}-help` : "", error ? `${def.name}-error` : ""].filter(Boolean).join(" ") || undefined;
        const input = field.input({
          className: cls("input"),
          required: field.required || undefined,
          "aria-invalid": error ? true : undefined,
          "aria-describedby": described,
        });
        const star = field.required ? <span aria-hidden="true"> *</span> : null;
        const notes = (
          <>
            {def.help_text ? (
              <p id={`${def.name}-help`} className={cls("help")}>
                {def.help_text}
              </p>
            ) : null}
            {error ? (
              <p id={`${def.name}-error`} role="alert" className={cls("error")}>
                {error}
              </p>
            ) : null}
          </>
        );
        if (def.type === "checkbox") {
          return (
            <div key={def.name} className={cls("field")} style={FIELD}>
              <label htmlFor={def.name} className={cls("label")} style={TICK}>
                {input}
                <span>
                  {field.label}
                  {star}
                </span>
              </label>
              {notes}
            </div>
          );
        }
        return (
          <div key={def.name} className={cls("field")} style={FIELD}>
            <label id={`${def.name}-label`} htmlFor={def.name} className={cls("label")}>
              {field.label}
              {star}
            </label>
            {input}
            {notes}
          </div>
        );
      })}

      {form.formError && !Object.keys(form.errors).length ? (
        <p role="alert" className={cls("formError")}>
          {form.formError}
        </p>
      ) : null}

      <button type="submit" disabled={form.submitting} className={cls("submit")}>
        {submitLabel}
      </button>
    </form>
  );
}

export default DashForm;
