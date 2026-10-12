/**
 * <MaintenancePage /> — the "we'll be right back" screen the SDK falls back to
 * when the backend can't be reached (or the operator flipped maintenance on).
 *
 * Deliberately self-contained and defensive:
 *   • No hooks → renders on the SERVER, ships in the SSR HTML.
 *   • All styles are INLINE → no external stylesheet, no Tailwind, nothing that
 *     needs the CDN. If the whole backend/CDN is down, this page still renders.
 *   • React.createElement (not JSX) so it bundles cleanly as a dependency across
 *     bundlers without the consumer transpiling node_modules.
 *   • An optional inline auto-refresh reloads the page every `refreshSeconds`, so
 *     visitors get the real site back on their own once you recover — no manual
 *     reload needed.
 *
 * Pair it with dash.checkHealth() at the top of your root layout / SSR entry:
 *
 *   const health = await dash.checkHealth();
 *   return health.ok ? children : <MaintenancePage message={health.message} brand="Acme" />;
 */

import React from "react";

const h = React.createElement;

export function MaintenancePage(props) {
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
    "We're doing a bit of scheduled maintenance and will be back online shortly. " +
      "Thanks for your patience.";

  const children = [
    logoUrl
      ? h("img", {
          key: "logo",
          src: logoUrl,
          alt: brand || "",
          style: { height: 40, width: "auto", marginBottom: 28 },
        })
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
            brand,
          )
        : null,

    // Pulsing dot — pure CSS keyframes injected once, no JS runtime.
    h(
      "div",
      {
        key: "dot",
        style: {
          width: 14,
          height: 14,
          borderRadius: "50%",
          background: accent,
          margin: "0 auto 28px",
          animation: "dfd-pulse 1.6s ease-in-out infinite",
        },
      },
    ),

    h(
      "h1",
      {
        key: "title",
        style: {
          margin: "0 0 12px",
          fontSize: 26,
          lineHeight: 1.2,
          fontWeight: 700,
          color: "#111827",
        },
      },
      title,
    ),

    h(
      "p",
      {
        key: "body",
        style: {
          margin: "0 auto",
          maxWidth: 440,
          fontSize: 16,
          lineHeight: 1.6,
          color: "#4b5563",
        },
      },
      body,
    ),

    until
      ? h(
          "p",
          {
            key: "until",
            style: { margin: "16px 0 0", fontSize: 14, color: "#6b7280" },
          },
          "Expected back: ",
          h("strong", { style: { color: "#374151" } }, until),
        )
      : null,

    supportEmail
      ? h(
          "p",
          {
            key: "support",
            style: { margin: "28px 0 0", fontSize: 14, color: "#6b7280" },
          },
          "Need help? ",
          h(
            "a",
            { href: `mailto:${supportEmail}`, style: { color: accent, textDecoration: "none" } },
            supportEmail,
          ),
        )
      : null,
  ].filter(Boolean);

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
        fontFamily:
          'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
        textAlign: "center",
        boxSizing: "border-box",
      },
    },
    // Keyframes + a <noscript>-safe meta refresh live in a style/meta pair.
    h("style", {
      dangerouslySetInnerHTML: {
        __html:
          "@keyframes dfd-pulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.6);opacity:.45}}",
      },
    }),
    h("div", { style: { maxWidth: 520 } }, ...children),
    refreshSeconds > 0
      ? h("script", {
          dangerouslySetInnerHTML: {
            __html: `setTimeout(function(){location.reload()},${Math.round(refreshSeconds) * 1000});`,
          },
        })
      : null,
  );
}

export default MaintenancePage;
