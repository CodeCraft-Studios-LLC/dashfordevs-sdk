"use client";

/**
 * useDashForm — Django-template-style field accessors over a
 * dashboard-built form schema.
 *
 * Quick start:
 *
 *   import { useDashForm } from "dash4devs/react";
 *
 *   function ContactPage() {
 *     const form = useDashForm("contact");
 *     if (form.loading) return <p>Loading…</p>;
 *     return (
 *       <form onSubmit={form.handleSubmit(() => alert("Sent!"))}>
 *         <label>{form.field("first_name").label}</label>
 *         {form.field("first_name").input({ className: "px-3 py-2" })}
 *         {form.field("first_name").error}
 *
 *         <label>{form.field("email").label}</label>
 *         {form.field("email").input()}
 *
 *         <button disabled={form.submitting}>Submit</button>
 *         {form.formError && <p>{form.formError}</p>}
 *         {form.success && <p>{form.successMessage}</p>}
 *       </form>
 *     );
 *   }
 *
 * Design notes:
 *   - The hook OWNS the form state. Callers don't need react-hook-form
 *     or formik unless they want richer features.
 *   - `field.input(props?)` returns a fully-configured React element.
 *     Caller can pass `props` to override className, placeholder,
 *     onBlur, etc.
 *   - `field.value`, `field.set(value)`, `field.error` are accessible
 *     directly so callers can build their own custom inputs and only
 *     borrow the state machine.
 *   - Conditional fields (`show_when`) are hidden automatically; their
 *     values are also stripped from the submission payload.
 *   - `useDashForm` requires a `<DashProvider>` ancestor to find the
 *     client. Pass an explicit `client` if you don't use a provider:
 *       useDashForm("slug", { client: dash });
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useDash } from "./DashProvider.jsx";
import { SignaturePad } from "./SignaturePad.jsx";

const TEXT_INPUT_TYPES = new Set([
  "text",
  "email",
  "tel",
  "date",
  "url",
  "number",
  "hidden",
]);

function defaultValueForField(field) {
  switch (field?.type) {
    case "checkbox":
      return false;
    case "multiselect":
      return [];
    default:
      return "";
  }
}

function shouldShowField(field, values) {
  const cond = field?.show_when;
  if (!cond || typeof cond !== "object") return true;
  const gateField = cond.field;
  const gateValue = cond.equals;
  if (!gateField) return true;
  return values[gateField] === gateValue;
}

function clientSideValidate(field, value) {
  if (!shouldShowField(field, value && typeof value === "object" ? value : {})) {
    // Conditional field that's hidden — skip validation entirely.
    return null;
  }
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

/**
 * @param {string} slug
 * @param {Object} [options]
 * @param {Object} [options.client] — explicit DashClient (defaults to DashProvider's)
 * @param {Object} [options.initialValues] — pre-fill values
 * @param {Function} [options.onSuccess] — callback after submit (receives the API response)
 * @param {Function} [options.onError]   — callback after submit failure
 */
export function useDashForm(slug, options = {}) {
  const dashCtx = useDashSafely();
  const client = options.client || dashCtx?.client;
  const initialValues = options.initialValues || {};

  const [schema, setSchema] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const [values, setValues] = useState(initialValues);
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [formError, setFormError] = useState(null);
  const [score, setScore] = useState(null);

  // ── Load schema ────────────────────────────────────────────────────
  useEffect(() => {
    if (!client) {
      setLoadError(
        "useDashForm: no client. Wrap your app in <DashProvider> or pass options.client.",
      );
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    client.forms
      .get(slug)
      .then((res) => {
        if (cancelled) return;
        const f = res?.form;
        setSchema(f);
        // Initialize values for each field if not already set.
        setValues((prev) => {
          const next = { ...prev };
          for (const field of f?.fields || []) {
            if (next[field.name] === undefined) {
              next[field.name] = defaultValueForField(field);
            }
          }
          return next;
        });
      })
      .catch((err) => {
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

  // ── Field state helpers ───────────────────────────────────────────
  const setFieldValue = useCallback((name, value) => {
    setValues((prev) => ({ ...prev, [name]: value }));
    setErrors((prev) => {
      if (!(name in prev)) return prev;
      const next = { ...prev };
      delete next[name];
      return next;
    });
  }, []);

  const fieldsByName = useMemo(() => {
    const map = {};
    for (const f of schema?.fields || []) map[f.name] = f;
    return map;
  }, [schema]);

  // ── Per-field renderer ────────────────────────────────────────────
  const renderInput = useCallback(
    (fieldDef, extraProps = {}) => {
      const name = fieldDef.name;
      const value = values[name];
      const onChange = (e) => {
        const t = e?.target;
        if (!t) return setFieldValue(name, e);
        if (t.type === "checkbox") return setFieldValue(name, t.checked);
        if (t.multiple && t.tagName === "SELECT") {
          const out = Array.from(t.selectedOptions, (o) => o.value);
          return setFieldValue(name, out);
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
            {(fieldDef.options || []).map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        );
      }
      if (t === "multiselect") {
        const arr = Array.isArray(value) ? value : [];
        return (
          <div role="group" aria-labelledby={`${name}-label`}>
            {(fieldDef.options || []).map((opt) => {
              const checked = arr.includes(opt.value);
              return (
                <label key={opt.value} style={{ display: "flex", gap: 8 }}>
                  <input
                    type="checkbox"
                    name={name}
                    value={opt.value}
                    checked={checked}
                    onChange={() => {
                      const next = checked
                        ? arr.filter((v) => v !== opt.value)
                        : [...arr, opt.value];
                      setFieldValue(name, next);
                    }}
                  />
                  <span>{opt.label}</span>
                </label>
              );
            })}
          </div>
        );
      }
      if (t === "checkbox") {
        return (
          <input
            {...baseProps}
            type="checkbox"
            checked={!!value}
            onChange={onChange}
          />
        );
      }
      if (t === "radio") {
        return (
          <div role="radiogroup" aria-labelledby={`${name}-label`}>
            {(fieldDef.options || []).map((opt) => (
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
        // File uploads need the dedicated /forms/<slug>/files endpoint
        // (separate card). For v1 we accept a File reference and keep
        // it in component state; the caller is responsible for
        // uploading + storing the resulting FormFile id back into
        // `values`. A future iteration can absorb this into the hook.
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
        // Drawn signature — emits a base64 PNG data URL. The backend
        // stores `data:image/...` strings on the same column as typed
        // signatures.
        const sigProps = { ...extraProps };
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
      // Unknown type — fall back to a text input so the form still
      // renders. Surfaces via console.warn so authors notice.
      if (typeof console !== "undefined") {
        console.warn(
          `useDashForm: unknown field type "${t}" for "${name}"; rendering as text.`,
        );
      }
      return (
        <input
          {...baseProps}
          type="text"
          value={value ?? ""}
          onChange={onChange}
        />
      );
    },
    [values, setFieldValue],
  );

  // ── field(name) accessor — Django-template style ─────────────────
  const field = useCallback(
    (name) => {
      const def = fieldsByName[name];
      if (!def) {
        return {
          name,
          label: name,
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
        set: (v) => setFieldValue(name, v),
        error: errors[name] || null,
        touched: !!touched[name],
        input: (extraProps) => (visible ? renderInput(def, extraProps) : null),
        missing: false,
      };
    },
    [fieldsByName, values, errors, touched, renderInput, setFieldValue],
  );

  // ── Submit ───────────────────────────────────────────────────────
  const validateAll = useCallback(() => {
    const out = {};
    for (const def of schema?.fields || []) {
      if (!shouldShowField(def, values)) continue;
      const err = clientSideValidate(def, values[def.name]);
      if (err) out[def.name] = err;
    }
    return out;
  }, [schema, values]);

  const collectPayload = useCallback(() => {
    const out = {};
    const sigs = [];
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
      if (def.type === "file") {
        // File handling is out of scope for the inline hook today —
        // see the v1 caveat in renderInput. Skip from the JSON
        // submission payload.
        continue;
      }
      out[def.name] = v;
    }
    return { answers: out, signatures: sigs };
  }, [schema, values]);

  const handleSubmit = useCallback(
    (onSuccess) => async (e) => {
      if (e?.preventDefault) e.preventDefault();
      if (!schema || !client) return;
      setFormError(null);
      const v = validateAll();
      setErrors(v);
      if (Object.keys(v).length > 0) {
        // Mark all touched so errors are visible.
        const allTouched = {};
        for (const def of schema.fields || []) allTouched[def.name] = true;
        setTouched(allTouched);
        return;
      }
      setSubmitting(true);
      try {
        const { answers, signatures } = collectPayload();
        const res = await client.forms.submit(slug, {
          answers,
          signatures,
          source_url:
            typeof window !== "undefined" ? window.location.href : undefined,
        });
        setSuccess(true);
        if (res?.score) setScore(res.score);
        if (onSuccess) onSuccess(res);
        if (options.onSuccess) options.onSuccess(res);
      } catch (err) {
        const msg = err?.message || "Submission failed.";
        // Try to surface server-side per-field validation errors.
        if (err?.fields && typeof err.fields === "object") {
          setErrors(err.fields);
        }
        setFormError(msg);
        if (options.onError) options.onError(err);
      } finally {
        setSubmitting(false);
      }
    },
    [schema, client, slug, validateAll, collectPayload, options],
  );

  // ── Reset (e.g. for "submit another") ─────────────────────────────
  const reset = useCallback(() => {
    setValues(() => {
      const next = { ...initialValues };
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
  }, [schema, initialValues]);

  return {
    // schema
    slug,
    title: schema?.title || "",
    description: schema?.description || "",
    fields: schema?.fields || [],

    // life cycle
    loading,
    loadError,

    // field access (Django-template style)
    field,

    // submission
    handleSubmit,
    submitting,
    success,
    successMessage: schema?.success_message || "",
    redirectUrl: schema?.redirect_url || "",
    formError,
    score,

    // raw state (escape hatch)
    values,
    errors,
    touched,
    setFieldValue,
    setValues,
    reset,
  };
}


// Defensive accessor — `useDash()` throws when there's no provider.
// Some callers will pass `options.client` explicitly to skip the
// provider; we want the hook to work in both cases.
function useDashSafely() {
  try {
    return useDash();
  } catch (_) {
    return undefined;
  }
}


export default useDashForm;
