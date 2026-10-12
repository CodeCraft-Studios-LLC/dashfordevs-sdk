/**
 * <MaintenancePage /> - the "we'll be right back" screen for when
 * dash.checkHealth() returns ok:false. No hooks (renders on the server),
 * inline styles only (works with the CDN down), optional auto-reload.
 *
 *   const health = await dash.checkHealth();
 *   return health.ok ? children : <MaintenancePage message={health.message} brand="Acme" />;
 */

import React from "react";

const h = React.createElement;

export interface MaintenancePageProps {
  /** Small brand label above the title (ignored if `logoUrl` is set). */
  brand?: string;
  /** Headline. Defaults to "We'll be right back". */
  title?: string;
  /** Body copy. */
  message?: string | null;
  /** Optional "expected back" hint. */
  until?: string | null;
  /** Logo image URL shown above the title. */
  logoUrl?: string | null;
  /** Support address shown at the bottom. */
  supportEmail?: string | null;
  /** Accent color. Defaults to indigo. */
  accent?: string;
  /** Auto-reload interval in seconds; 0 disables. Default 30. */
  refreshSeconds?: number;
}

export function MaintenancePage(props?: MaintenancePageProps): React.JSX.Element {
  const {
    brand = null,
    title = "We'll be right back",
    message = null,
    until = null,
    logoUrl = null,
    supportEmail = null,
    accent = "#4f46e5",
    refreshSeconds = 30,
  } = props || {};

  const body =
    message ||
    "We're doing a bit of scheduled maintenance and will be back online shortly. Thanks for your patience.";

  const children = [
    logoUrl
      ? h("img", { key: "logo", src: logoUrl, alt: brand || "", style: { height: 40, width: "auto", marginBottom: 28 } })
      : brand
        ? h(
            "div",
            {
              key: "brand",
              style: {
                fontSize: 15,
                fontWeight: 700,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: accent,
                marginBottom: 28,
              },
            },
            brand
          )
        : null,

    h("div", {
      key: "dot",
      style: {
        width: 14,
        height: 14,
        borderRadius: "50%",
        background: accent,
        margin: "0 auto 28px",
        animation: "dfd-pulse 1.6s ease-in-out infinite",
      },
    }),

    h("h1", { key: "title", style: { margin: "0 0 12px", fontSize: 26, lineHeight: 1.2, fontWeight: 700, color: "#111827" } }, title),

    h("p", { key: "body", style: { margin: "0 auto", maxWidth: 440, fontSize: 16, lineHeight: 1.6, color: "#4b5563" } }, body),

    until
      ? h(
          "p",
          { key: "until", style: { margin: "16px 0 0", fontSize: 14, color: "#6b7280" } },
          "Expected back: ",
          h("strong", { style: { color: "#374151" } }, until)
        )
      : null,

    supportEmail
      ? h(
          "p",
          { key: "support", style: { margin: "28px 0 0", fontSize: 14, color: "#6b7280" } },
          "Need help? ",
          h("a", { href: `mailto:${supportEmail}`, style: { color: accent, textDecoration: "none" } }, supportEmail)
        )
      : null,
  ].filter(Boolean);

  const seconds = Math.max(0, Math.round(Number(refreshSeconds) || 0));

  return h(
    "div",
    {
      "data-dashfordevs": "maintenance",
      style: {
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        background: "#f9fafb",
        fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
        textAlign: "center",
        boxSizing: "border-box",
      },
    } as any,
    h("style", {
      dangerouslySetInnerHTML: {
        __html: "@keyframes dfd-pulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.6);opacity:.45}}",
      },
    }),
    h("div", { style: { maxWidth: 520 } }, ...(children as React.ReactNode[])),
    seconds > 0
      ? h("script", { dangerouslySetInnerHTML: { __html: `setTimeout(function(){location.reload()},${seconds * 1000});` } })
      : null
  );
}

export default MaintenancePage;
