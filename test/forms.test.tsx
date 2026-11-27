// @vitest-environment jsdom
/**
 * Forms built on forms.dashfordevs.com: <DashForm> draws every field from the
 * published form and sends the answers; onSubmit can stop it, onSuccess and
 * onError report what happened; what is not shown is never sent.
 */
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { loadV2, recorder } from "./helpers";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let V2: any;
let R: any;
beforeAll(async () => {
  V2 = await loadV2();
  R = await import("../dist/react/index.js");
  (window as any).__dash4devsConsoleWarned = true;
});

const FORM = {
  slug: "intake",
  title: "New client intake",
  description: "Before your visit",
  kind: "intake",
  success_message: "See you soon.",
  redirect_url: "",
  sign_in_required: false,
  fields: [
    { name: "full_name", label: "Full name", type: "text", required: true },
    { name: "email", label: "Email", type: "email", required: true, help_text: "We write to you here" },
    { name: "note", label: "Before we start", type: "heading", content: "Read this first." },
    { name: "medication", label: "Any medication?", type: "radio", required: true, options: [{ value: "Yes", label: "Yes" }, { value: "No", label: "No" }] },
    { name: "which", label: "Which ones?", type: "textarea", required: true, show_when: { field: "medication", equals: "Yes" } },
    { name: "agree", label: "I agree", type: "checkbox", required: true, required_message: "Tick this to go on" },
    { name: "source", label: "Source", type: "hidden", value: "website" },
  ],
};

async function render(el: React.ReactElement) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(el);
  });
  await act(async () => {});
  return host;
}

function type(host: HTMLElement, name: string, value: string) {
  const input = host.querySelector(`[name="${name}"]`) as HTMLInputElement;
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), "value")!.set!;
  setter.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

async function send(host: HTMLElement) {
  await act(async () => {
    host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
  await act(async () => {});
}

describe("<DashForm>", () => {
  it("draws the form from papi and sends only what is shown", async () => {
    const { calls, fetchMock } = recorder((url) =>
      url.endsWith("/submit")
        ? { status: 201, body: { success: true, submission_id: "sresp__1", submitted_at: "2026-11-27T18:00:00+00:00", success_message: "See you soon.", redirect_url: "" } }
        : url.includes("/forms/")
          ? { body: { form: FORM } }
          : { body: {} }
    );
    const dash = new V2.DashClient({ apiKey: "pk_test_x", target: "papi", fetch: fetchMock });
    const onSubmit = vi.fn();
    const onSuccess = vi.fn();
    const host = await render(<R.DashForm slug="intake" client={dash} onSubmit={onSubmit} onSuccess={onSuccess} />);

    // (The client's own start-up ping goes first; the form is read by its address.)
    expect(calls.some((c) => c.method === "GET" && c.url.endsWith("/api/storefront/forms/intake"))).toBe(true);
    expect(host.querySelector("h2")!.textContent).toBe("New client intake");
    expect(host.textContent).toContain("Read this first.");
    expect(host.querySelector('[name="which"]')).toBeNull(); // depends on an answer not given yet
    expect(host.querySelector('[name="source"]')).toBeNull(); // hidden

    // Nothing filled in: the form's own checks stop it, in words.
    await send(host);
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(0);
    expect(host.textContent).toContain("Tick this to go on");

    await act(async () => {
      type(host, "full_name", "Pat Invented");
      type(host, "email", "pat@example.test");
      (host.querySelector('input[type="radio"][value="No"]') as HTMLInputElement).click();
      (host.querySelector('input[type="checkbox"][name="agree"]') as HTMLInputElement).click();
    });
    await send(host);

    const post = calls.find((c) => c.method === "POST")!;
    expect(post.url).toContain("/api/storefront/forms/intake/submit");
    expect(post.body.answers).toEqual({ full_name: "Pat Invented", email: "pat@example.test", medication: "No", agree: true, source: "website" });
    expect(onSubmit).toHaveBeenCalledWith(post.body.answers);
    expect(onSuccess).toHaveBeenCalledWith(expect.objectContaining({ submission_id: "sresp__1" }));
    expect(host.textContent).toContain("See you soon.");
    expect(host.querySelector("form")).toBeNull();
  });

  it("onSubmit can stop it, and a refusal reaches onError with the fields in words", async () => {
    const { calls, fetchMock } = recorder((url) =>
      url.endsWith("/submit")
        ? { status: 422, body: { error: "validation_error", message: "Some answers need another look.", fields: { email: "invalid" } } }
        : url.includes("/forms/")
          ? { body: { form: { ...FORM, fields: FORM.fields.slice(0, 2) } } }
          : { body: {} }
    );
    const dash = new V2.DashClient({ apiKey: "pk_test_x", target: "papi", fetch: fetchMock });
    let allow = false;
    const onError = vi.fn();
    const host = await render(<R.DashForm slug="intake" client={dash} onSubmit={() => allow} onError={onError} submitLabel="Go" />);
    expect(host.querySelector("button")!.textContent).toBe("Go");
    await act(async () => {
      type(host, "full_name", "Pat Invented");
      type(host, "email", "pat@example");
    });

    await send(host);
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(0);
    expect(onError).not.toHaveBeenCalled();

    allow = true;
    await send(host);
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(1);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0].fields).toEqual({ email: "invalid" });
    expect(host.textContent).toContain("That does not look right");
    expect(host.querySelector("form")).not.toBeNull();
  });
});
