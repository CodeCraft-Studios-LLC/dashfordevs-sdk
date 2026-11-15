/**
 * `dash4devs login` / `logout` / `whoami`.
 */
import { pc, sym, badge } from "../ui.js";
import * as p from "../prompt.js";
import * as auth from "../auth.js";
import { dogSays } from "../mascot.js";

const who = (c) => `${pc.bold(c.user?.name || "you")} ${pc.dim(c.user?.email ? `<${c.user.email}>` : "")}`;

/** Make sure we're logged in; runs the browser flow if not. Returns credentials or null. */
export async function ensureLogin({ quiet = false } = {}) {
  const have = auth.readCredentials();
  if (have) {
    if (!quiet) p.log.success(`Logged in as ${who(have)}${have.mode === "preview" ? " " + badge.preview() : ""}`);
    return have;
  }
  return browserLogin();
}

async function browserLogin() {
  const s = p.spinner();
  const ac = new AbortController();
  const onSig = () => ac.abort();
  process.once("SIGINT", onSig);
  try {
    const creds = await auth.login({
      signal: ac.signal,
      onUrl: (url, opened) => {
        p.log.info(
          (opened ? "Opened your browser to log in." : "Open this link to log in:") +
            (auth.PREVIEW ? " " + badge.preview() : "") +
            `\n  ${pc.gray("│")}  ${pc.cyan(pc.underline(url))}`
        );
        s.start("Waiting for you in the browser… " + pc.dim("(ctrl+c to cancel)"));
      },
    });
    s.stop(`Logged in as ${who(creds)}`);
    return creds;
  } catch (e) {
    s.stop(pc.red(e.message));
    return null;
  } finally {
    process.removeListener("SIGINT", onSig);
  }
}

export async function run(args = []) {
  const cmd = args[0];
  if (cmd === "logout") {
    const had = auth.logout();
    console.log(had ? `\n  ${sym.ok} Logged out. See you soon!\n` : `\n  ${pc.dim("You weren't logged in.")}\n`);
    return;
  }
  if (cmd === "whoami") {
    const c = auth.readCredentials();
    if (!c) {
      console.log(`\n  ${sym.warn} Not logged in. Run ${pc.cyan("dash4devs login")}\n`);
      process.exitCode = 1;
      return;
    }
    console.log(`\n  ${who(c)}${c.mode === "preview" ? " " + badge.preview() : ""}\n`);
    return;
  }

  p.intro(pc.bgCyan(pc.black(pc.bold(" dash4devs login "))));
  const existing = auth.readCredentials();
  if (existing) {
    const again = await p.confirm({ message: `Already logged in as ${existing.user?.email || existing.user?.name}. Log in again?`, initialValue: false });
    if (p.isCancel(again) || !again) return p.outro(pc.dim("Kept your current login."));
    auth.logout();
  }
  const creds = await browserLogin();
  if (!creds) {
    process.exitCode = 1;
    return p.outro(pc.dim("Not logged in."));
  }
  p.outro(`Next: ${pc.cyan("dash4devs create")}`);
  await dogSays(`${pc.bold(pc.cyan("Hi " + (creds.user?.name?.split(" ")[0] || "friend") + "!"))} Let's build something.`);
  console.log("");
}
