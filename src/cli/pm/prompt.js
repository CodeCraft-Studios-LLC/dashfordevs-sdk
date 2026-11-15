/**
 * Small clack-style prompt kit for the project-manager commands.
 * Zero dependencies beyond chalk (the SDK already ships it). Node >= 18.
 *
 * Every prompt resolves to CANCEL when the user hits Esc / Ctrl+C.
 * Without a TTY, prompts return their default so scripts never hang.
 */
import readline from "node:readline";
import { pc, sym, sleep, stripAnsi as strip } from "./ui.js";

export const CANCEL = Symbol("cancel");
export const isCancel = (v) => v === CANCEL;
const tty = () => Boolean(process.stdin.isTTY && process.stdout.isTTY);

const BAR = pc.gray("│");
const out = (s) => process.stdout.write(s);

export function intro(title) {
  console.log(`  ${pc.gray("┌")}  ${title}`);
  console.log(`  ${BAR}`);
}
export function outro(msg) {
  console.log(`  ${pc.gray("└")}  ${msg}\n`);
}
export const log = {
  success: (m) => console.log(`  ${sym.ok}  ${m}\n  ${BAR}`),
  info: (m) => console.log(`  ${pc.cyan("●")}  ${m}\n  ${BAR}`),
  warn: (m) => console.log(`  ${sym.warn}  ${m}\n  ${BAR}`),
  step: (m) => console.log(`  ${pc.green("◇")}  ${m}\n  ${BAR}`),
};
export function cancel(msg = "Cancelled.") {
  console.log(`  ${pc.gray("└")}  ${pc.red(msg)}\n`);
}


/** A titled box hanging off the left rail, like clack's note(). */
export function note(lines, title = "") {
  const w = Math.max(...lines.map((l) => strip(l).length), strip(title).length + 2) + 2;
  console.log(`  ${pc.green("◇")}  ${pc.bold(title)} ${pc.gray("─".repeat(Math.max(w - strip(title).length - 1, 1)) + "╮")}`);
  console.log(`  ${BAR}${" ".repeat(w + 3)}${pc.gray("│")}`);
  for (const l of lines) console.log(`  ${BAR}  ${l}${" ".repeat(w - strip(l).length + 1)}${pc.gray("│")}`);
  console.log(`  ${BAR}${" ".repeat(w + 3)}${pc.gray("│")}`);
  console.log(`  ${pc.gray("├" + "─".repeat(w + 3) + "╯")}`);
}

/** Run fn(key) on each keypress in raw mode until fn returns something !== undefined. */
function keyLoop(render, onKey) {
  return new Promise((resolve) => {
    readline.emitKeypressEvents(process.stdin);
    const wasRaw = process.stdin.isRaw;
    process.stdin.setRawMode(true);
    process.stdin.resume();
    out("\x1b[?25l");
    let lines = render(false);
    const finish = (v) => {
      process.stdin.removeListener("keypress", handler);
      process.stdin.setRawMode(wasRaw);
      process.stdin.pause();
      out(`\x1b[${lines}A\x1b[0J`);
      out("\x1b[?25h");
      resolve(v);
    };
    const handler = (str, key = {}) => {
      if ((key.ctrl && key.name === "c") || key.name === "escape") return finish(CANCEL);
      const r = onKey(str, key);
      if (r !== undefined) return finish(r);
      out(`\x1b[${lines}A\x1b[0J`);
      lines = render(false);
    };
    process.stdin.on("keypress", handler);
  });
}

function writeBlock(rows) {
  out(rows.join("\n") + "\n");
  return rows.length;
}

/** Arrow-key menu. options: [{ value, label, hint, disabled }] (disabled ones are shown but skipped) */
export async function select({ message, options, initialValue }) {
  const ok = (n) => !options[n].disabled;
  let i = options.findIndex((o) => o.value === initialValue && !o.disabled);
  if (i < 0) i = options.findIndex((o) => !o.disabled);
  if (!tty()) return options[i].value;
  const step = (d) => {
    let n = i;
    do n = (n + d + options.length) % options.length;
    while (!ok(n) && n !== i);
    i = n;
  };
  const r = await keyLoop(
    () =>
      writeBlock([
        `  ${pc.cyan("◆")}  ${pc.bold(message)}`,
        ...options.map((o, n) =>
          o.disabled
            ? `  ${pc.cyan("│")}  ${pc.gray("○ " + strip(o.label))}${o.hint ? " " + pc.gray(o.hint) : ""}`
            : n === i
              ? `  ${pc.cyan("│")}  ${pc.green("●")} ${o.label}${o.hint ? " " + pc.dim(o.hint) : ""}`
              : `  ${pc.cyan("│")}  ${pc.dim("○ " + strip(o.label))}`
        ),
        `  ${pc.cyan("└")}  ${pc.dim("↑/↓ to move · enter to pick · esc to cancel")}`,
      ]),
    (str, key) => {
      if (key.name === "up" || str === "k") step(-1);
      else if (key.name === "down" || str === "j") step(1);
      else if (key.name === "return") return options[i].value;
      return undefined;
    }
  );
  if (r === CANCEL) return r;
  const picked = options.find((o) => o.value === r);
  console.log(`  ${pc.green("◇")}  ${message}\n  ${BAR}  ${pc.dim(strip(picked.label))}`);
  return r;
}

/** Single-line text input with optional placeholder/default and validate(v) -> error string. */
export async function text({ message, placeholder = "", defaultValue = "", validate }) {
  if (!tty()) return defaultValue;
  let val = "";
  let err = "";
  const r = await keyLoop(
    () =>
      writeBlock([
        `  ${err ? pc.yellow("▲") : pc.cyan("◆")}  ${pc.bold(message)}`,
        `  ${pc.cyan("│")}  ${val ? val : pc.dim(placeholder)}${pc.inverse(" ")}`,
        `  ${pc.cyan("└")}  ${err ? pc.yellow(err) : ""}`,
      ]),
    (str, key) => {
      if (key.name === "return") {
        const v = val.trim() || defaultValue;
        const e = validate ? validate(v) : undefined;
        if (e) {
          err = e;
          return undefined;
        }
        return v;
      }
      err = "";
      if (key.name === "backspace") val = val.slice(0, -1);
      else if (str && !key.ctrl && !key.meta && str.length === 1 && str >= " ") val += str;
      return undefined;
    }
  );
  if (r === CANCEL) return r;
  console.log(`  ${pc.green("◇")}  ${message}\n  ${BAR}  ${pc.dim(r || "(empty)")}`);
  return r;
}

export async function confirm({ message, initialValue = true }) {
  if (!tty()) return initialValue;
  let yes = initialValue;
  const r = await keyLoop(
    () =>
      writeBlock([
        `  ${pc.cyan("◆")}  ${pc.bold(message)}`,
        `  ${pc.cyan("│")}  ${yes ? pc.green("● Yes") : pc.dim("○ Yes")} ${pc.dim("/")} ${!yes ? pc.green("● No") : pc.dim("○ No")}`,
        `  ${pc.cyan("└")}`,
      ]),
    (str, key) => {
      if (["left", "right", "up", "down", "tab"].includes(key.name)) yes = !yes;
      else if (str === "y") return true;
      else if (str === "n") return false;
      else if (key.name === "return") return yes;
      return undefined;
    }
  );
  if (r === CANCEL) return r;
  console.log(`  ${pc.green("◇")}  ${message}\n  ${BAR}  ${pc.dim(r ? "Yes" : "No")}`);
  return r;
}

const FRAMES = ["◒", "◐", "◓", "◑"];
export function spinner() {
  let t = null;
  let f = 0;
  let label = "";
  return {
    start(l) {
      label = l;
      if (!process.stdout.isTTY) return;
      out("\x1b[?25l");
      t = setInterval(() => out(`\r\x1b[2K  ${pc.magenta(FRAMES[f++ % 4])}  ${label}`), 90);
    },
    stop(l = label) {
      if (t) clearInterval(t);
      if (process.stdout.isTTY) out("\r\x1b[2K\x1b[?25h");
      console.log(`  ${pc.green("◇")}  ${l}\n  ${BAR}`);
    },
  };
}

/** Spinner around a fake step (UI-only preview work). */
export async function fakeStep(label, ms) {
  const s = spinner();
  s.start(label);
  await sleep(ms);
  s.stop(`${label} ${pc.dim("(preview)")}`);
}
