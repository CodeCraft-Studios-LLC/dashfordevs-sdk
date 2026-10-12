/**
 * The "Stop" warning in the browser console, the same one the Dash4Devs
 * dashboard prints.
 *
 * Self-XSS is the attack it answers: someone is talked into pasting a line
 * into the console "to unlock a feature", and what they paste reads their
 * session and acts as them. Every large consumer product prints a loud warning
 * first, in plain language about the consequence rather than the mechanism.
 *
 * Localhost is skipped by default: the console is a working surface there,
 * and a banner that cries wolf on every reload is one nobody reads on the day
 * it matters.
 *
 *   // Next.js root layout, as the first thing in <head> or <body>:
 *   import { consoleWarningScript } from "dash4devs/security"
 *   <script dangerouslySetInnerHTML={{ __html: consoleWarningScript() }} />
 *
 *   // Or from any client code:
 *   import { printConsoleWarning } from "dash4devs/security"
 *   printConsoleWarning()
 */

export const DEFAULT_CONSOLE_WARNING = {
  title: "Stop",
  heading: "This console is for developers.",
  body:
    "If someone told you to copy and paste something here, they are trying to " +
    "take over your account. Pasting it can give them your orders, your customers " +
    "and their addresses, and the ability to act as you.\n\n" +
    "Do not paste anything into this window unless you wrote it and you understand " +
    "exactly what it does.",
  color: "#c1341f",
};

const LOCAL_HOSTS = ["localhost", "127.0.0.1", "[::1]"];

function resolve(options = {}) {
  return {
    ...DEFAULT_CONSOLE_WARNING,
    ...options,
    skipLocalhost: options.skipLocalhost !== false,
  };
}

/**
 * Print the warning now. Browser only; a no-op on the server and, unless
 * `skipLocalhost: false`, on localhost.
 *
 * @param {{ title?: string, heading?: string, body?: string, color?: string, skipLocalhost?: boolean }} [options]
 * @returns {boolean} whether it printed
 */
export function printConsoleWarning(options = {}) {
  if (typeof window === "undefined" || typeof console === "undefined") return false;
  window.__dash4devsConsoleWarned = true;
  const o = resolve(options);
  try {
    const host = window.location.hostname;
    if (o.skipLocalhost && (LOCAL_HOSTS.includes(host) || host.endsWith(".localhost"))) return false;
    console.log(`%c${o.title}`, `color:${o.color};font-size:44px;font-weight:800;-webkit-text-stroke:1px #000`);
    console.log(`%c${o.heading}`, `color:${o.color};font-size:18px;font-weight:700`);
    console.log(`%c${o.body}`, "color:inherit;font-size:14px;line-height:1.5");
    return true;
  } catch {
    return false;
  }
}

/**
 * The same warning as an inline script, for server-rendered pages: it runs
 * before any app code, so it is the first thing in the console.
 *
 * @param {{ title?: string, heading?: string, body?: string, color?: string, skipLocalhost?: boolean }} [options]
 * @returns {string} script source (no <script> tags)
 */
export function consoleWarningScript(options = {}) {
  const o = resolve(options);
  // JSON.stringify makes every string a safe JS literal; "<" is escaped so the
  // text can never close the surrounding <script> tag.
  const lit = (v) => JSON.stringify(v).replace(/</g, "\\u003c");
  return (
    // Marks the page as warned so the DashClient does not print it again.
    "(function(){try{window.__dash4devsConsoleWarned=true;" +
    `var h=location.hostname;if(${o.skipLocalhost ? "true" : "false"}&&(${lit(LOCAL_HOSTS)}.indexOf(h)>-1||/\\.localhost$/.test(h)))return;` +
    `console.log("%c"+${lit(o.title)},${lit(`color:${o.color};font-size:44px;font-weight:800;-webkit-text-stroke:1px #000`)});` +
    `console.log("%c"+${lit(o.heading)},${lit(`color:${o.color};font-size:18px;font-weight:700`)});` +
    `console.log("%c"+${lit(o.body)},"color:inherit;font-size:14px;line-height:1.5");` +
    "}catch(e){}})();"
  );
}
