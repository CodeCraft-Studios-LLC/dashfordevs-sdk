"use client";

/**
 * useDashForm - Django-template-style field accessors over a dashboard-built
 * form schema.
 *
 *   const form = useDashForm("contact");
 *   <form onSubmit={form.handleSubmit(() => alert("Sent!"))}>
 *     <label>{form.field("email").label}</label>
 *     {form.field("email").input({ className: "px-3 py-2" })}
 *     {form.field("email").error}
 *   </form>
 *
 * Needs a <DashProvider> ancestor, or `useDashForm(slug, { client: dash })`.
 * v2: server-side per-field errors (422 `fields`) now reach `errors`, because
 * DashApiError carries `fields`; v1's error had them only under `details`.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import type { DashClient } from "../client.js";
import { useDash } from "./DashProvider.js";
import { SignaturePad } from "./SignaturePad.js";

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
  input: (extraProps?: Record<string, any>) => React.ReactNode;
  missing: boolean;
}

export interface UseDashFormOptions {
  client?: DashClient;
  initialValues?: Record<string, unknown>;
  onSuccess?: (response: any) => void;
  onError?: (err: any) => void;
}

export interface UseDashFormResult {
  slug: string;
  title: string;
  description: string;
  fields: any[];
  loading: boolean;
  loadError: string | null;
  field: (name: string) => DashFormFieldAccessor;
  handleSubmit: (onSuccess?: (response: any) => void) => (e?: React.FormEvent) => Promise<void>;
  submitting: boolean;
  success: boolean;
  successMessage: string;
  redirectUrl: string;
  formError: string | null;
  score: unknown;
  values: Record<string, unknown>;
  errors: Record<string, string>;
  touched: Record<string, boolean>;
  setFieldValue: (name: string, value: unknown) => void;
  setValues: React.Dispatch<React.SetStateAction<Record<string, unknown>>>;
  reset: () => void;
}

const TEXT_INPUT_TYPES = new Set(["text", "email", "tel", "date", "url", "number", "hidden"]);

function defaultValueForField(field: any): unknown {
  switch (field?.type) {
    case "checkbox":
      return false;
    case "multiselect":
      return [];
    default:
      return "";
  }
}

function shouldShowField(field: any, values: Record<string, unknown>): boolean {
  const cond = field?.show_when;
  if (!cond || typeof cond !== "object") return true;
  if (!cond.field) return true;
  return values[cond.field] === cond.equals;
}

function clientSideValidate(field: any, value: unknown): string | null {
  const isBlank =
    value === undefined ||
    value === null ||
    value === "" ||
    (Array.isArray(value) && value.length === 0) ||
    (field.type === "checkbox" && value === false);

  if (field.required && isBlank) {
    return field.required_message || "Required";
  }
  if (typeof value === "string" && field.max_length && value.length > field.max_length) {
    return `Too long (max ${field.max_length})`;
  }
  if (typeof value === "string" && field.min_length && value.length < field.min_length) {
    return `Too short (min ${field.min_length})`;
  }
  return null;
}

/** useDash() without throwing when there is no provider. */
function useDashSafely(): { client: DashClient } | undefined {
  try {
    return useDash();
  } catch {
    return undefined;
  }
}

export function useDashForm(slug: string, options: UseDashFormOptions = {}): UseDashFormResult {
  const dashCtx = useDashSafely();
  const client = options.client || dashCtx?.client;
  const initialValues = options.initialValues || {};

  const [schema, setSchema] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [values, setValues] = useState<Record<string, unknown>>(initialValues);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [score, setScore] = useState<unknown>(null);

  useEffect(() => {
    if (!client) {
      setLoadError("useDashForm: no client. Wrap your app in <DashProvider> or pass options.client.");
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    client.forms
      .get(slug)
      .then((res: any) => {
        if (cancelled) return;
        const f = res?.form;
        setSchema(f);
        setValues((prev) => {
          const next = { ...prev };
          for (const field of f?.fields || []) {
            if (next[field.name] === undefined) next[field.name] = defaultValueForField(field);
          }
          return next;
        });
      })
      .catch((err: any) => {
        if (cancelled) return;
        setLoadError(err?.message || "Failed to load form.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [client, slug]);

  const setFieldValue = useCallback((name: string, value: unknown) => {
    setValues((prev) => ({ ...prev, [name]: value }));
    setErrors((prev) => {
      if (!(name in prev)) return prev;
      const next = { ...prev };
      delete next[name];
      return next;
    });
  }, []);

  const fieldsByName = useMemo(() => {
    const map: Record<string, any> = {};
    for (const f of schema?.fields || []) map[f.name] = f;
    return map;
  }, [schema]);

  const renderInput = useCallback(
    (fieldDef: any, extraProps: Record<string, any> = {}): React.ReactNode => {
      const name = fieldDef.name;
      const value: any = values[name];
      const onChange = (e: any) => {
        const t = e?.target;
        if (!t) return setFieldValue(name, e);
        if (t.type === "checkbox") return setFieldValue(name, t.checked);
        if (t.multiple && t.tagName === "SELECT") {
          return setFieldValue(name, Array.from(t.selectedOptions as ArrayLike<HTMLOptionElement>, (o) => o.value));
        }
        return setFieldValue(name, t.value);
      };
      const baseProps = {
        id: name,
        name,
        onBlur: () => setTouched((p) => ({ ...p, [name]: true })),
        ...extraProps,
      };
      const t = fieldDef.type || "text";
      if (TEXT_INPUT_TYPES.has(t)) {
        return (
          <input
            {...baseProps}
            type={t}
            value={value ?? ""}
            placeholder={fieldDef.placeholder || ""}
            maxLength={fieldDef.max_length || undefined}
            onChange={onChange}
          />
        );
      }
      if (t === "textarea") {
        return (
          <textarea
            {...baseProps}
            value={value ?? ""}
            placeholder={fieldDef.placeholder || ""}
            maxLength={fieldDef.max_length || undefined}
            onChange={onChange}
          />
        );
      }
      if (t === "select") {
        return (
          <select {...baseProps} value={value ?? ""} onChange={onChange}>
            <option value="">{fieldDef.placeholder || "Select…"}</option>
            {(fieldDef.options || []).map((opt: any) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        );
      }
      if (t === "multiselect") {
        const arr: unknown[] = Array.isArray(value) ? value : [];
        return (
          <div role="group" aria-labelledby={`${name}-label`}>
            {(fieldDef.options || []).map((opt: any) => {
              const checked = arr.includes(opt.value);
              return (
                <label key={opt.value} style={{ display: "flex", gap: 8 }}>
                  <input
                    type="checkbox"
                    name={name}
                    value={opt.value}
                    checked={checked}
                    onChange={() => setFieldValue(name, checked ? arr.filter((v) => v !== opt.value) : [...arr, opt.value])}
                  />
                  <span>{opt.label}</span>
                </label>
              );
            })}
          </div>
        );
      }
      if (t === "checkbox") {
        return <input {...baseProps} type="checkbox" checked={!!value} onChange={onChange} />;
      }
      if (t === "radio") {
        return (
          <div role="radiogroup" aria-labelledby={`${name}-label`}>
            {(fieldDef.options || []).map((opt: any) => (
              <label key={opt.value} style={{ display: "flex", gap: 8 }}>
                <input
                  type="radio"
                  name={name}
                  value={opt.value}
                  checked={value === opt.value}
                  onChange={() => setFieldValue(name, opt.value)}
                />
                <span>{opt.label}</span>
              </label>
            ))}
          </div>
        );
      }
      if (t === "file") {
        return (
          <input
            {...baseProps}
            type="file"
            accept={fieldDef.accept || undefined}
            onChange={(e) => setFieldValue(name, e.target.files?.[0] || null)}
          />
        );
      }
      if (t === "signature") {
        const sigProps: Record<string, any> = { ...extraProps };
        delete sigProps.id;
        delete sigProps.name;
        delete sigProps.onBlur;
        return (
          <SignaturePad
            value={typeof value === "string" ? value : ""}
            onChange={(dataUrl) => setFieldValue(name, dataUrl)}
            width={fieldDef.signature_width || 480}
            height={fieldDef.signature_height || 160}
            placeholder={fieldDef.placeholder || "Sign above"}
            disabled={!!fieldDef.disabled}
            {...sigProps}
          />
        );
      }
      if (typeof console !== "undefined") {
        console.warn(`useDashForm: unknown field type "${t}" for "${name}"; rendering as text.`);
      }
      return <input {...baseProps} type="text" value={value ?? ""} onChange={onChange} />;
    },
    [values, setFieldValue]
  );

  const field = useCallback(
    (name: string): DashFormFieldAccessor => {
      const def = fieldsByName[name];
      if (!def) {
        return {
          name,
          label: name,
          type: "text",
          options: [],
          input: () => null,
          value: undefined,
          set: () => {},
          error: null,
          touched: false,
          required: false,
          visible: false,
          missing: true,
        };
      }
      const visible = shouldShowField(def, values);
      return {
        name,
        label: def.label || name,
        helpText: def.help_text || "",
        type: def.type || "text",
        required: !!def.required,
        options: def.options || [],
        visible,
        value: values[name],
        set: (v: unknown) => setFieldValue(name, v),
        error: errors[name] || null,
        touched: !!touched[name],
        input: (extraProps?: Record<string, any>) => (visible ? renderInput(def, extraProps) : null),
        missing: false,
      };
    },
    [fieldsByName, values, errors, touched, renderInput, setFieldValue]
  );

  const validateAll = useCallback(() => {
    const out: Record<string, string> = {};
    for (const def of schema?.fields || []) {
      if (!shouldShowField(def, values)) continue;
      const err = clientSideValidate(def, values[def.name]);
      if (err) out[def.name] = err;
    }
    return out;
  }, [schema, values]);

  const collectPayload = useCallback(() => {
    const out: Record<string, unknown> = {};
    const sigs: Array<{ field_name: string; value: string }> = [];
    for (const def of schema?.fields || []) {
      if (!shouldShowField(def, values)) continue;
      const v = values[def.name];
      if (def.type === "signature") {
        if (typeof v === "string" && v.trim()) {
          sigs.push({ field_name: def.name, value: v.trim() });
          out[def.name] = v.trim();
        }
        continue;
      }
      if (def.type === "file") continue;
      out[def.name] = v;
    }
    return { answers: out, signatures: sigs };
  }, [schema, values]);

  const handleSubmit = useCallback(
    (onSuccess?: (response: any) => void) => async (e?: React.FormEvent) => {
      if (e?.preventDefault) e.preventDefault();
      if (!schema || !client) return;
      setFormError(null);
      const v = validateAll();
      setErrors(v);
      if (Object.keys(v).length > 0) {
        const allTouched: Record<string, boolean> = {};
        for (const def of schema.fields || []) allTouched[def.name] = true;
        setTouched(allTouched);
        return;
      }
      setSubmitting(true);
      try {
        const { answers, signatures } = collectPayload();
        const res: any = await client.forms.submit(slug, {
          answers,
          signatures,
          source_url: typeof window !== "undefined" ? window.location.href : undefined,
        });
        setSuccess(true);
        if (res?.score) setScore(res.score);
        if (onSuccess) onSuccess(res);
        if (options.onSuccess) options.onSuccess(res);
      } catch (err: any) {
        const msg = err?.message || "Submission failed.";
        const fields = err?.fields || err?.details?.fields;
        if (fields && typeof fields === "object") setErrors(fields);
        setFormError(msg);
        if (options.onError) options.onError(err);
      } finally {
        setSubmitting(false);
      }
    },
    [schema, client, slug, validateAll, collectPayload, options]
  );

  const reset = useCallback(() => {
    setValues(() => {
      const next: Record<string, unknown> = { ...initialValues };
      for (const f of schema?.fields || []) {
        if (next[f.name] === undefined) next[f.name] = defaultValueForField(f);
      }
      return next;
    });
    setErrors({});
    setTouched({});
    setSuccess(false);
    setFormError(null);
    setScore(null);
    // Intentionally keyed on the schema only (v1 behaviour).
  }, [schema]);

  return {
    slug,
    title: schema?.title || "",
    description: schema?.description || "",
    fields: schema?.fields || [],
    loading,
    loadError,
    field,
    handleSubmit,
    submitting,
    success,
    successMessage: schema?.success_message || "",
    redirectUrl: schema?.redirect_url || "",
    formError,
    score,
    values,
    errors,
    touched,
    setFieldValue,
    setValues,
    reset,
  };
}

export default useDashForm;
