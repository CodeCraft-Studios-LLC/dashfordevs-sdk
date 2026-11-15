import chalk from "chalk";

// chalk stands in for picocolors (the SDK already ships chalk; no new deps).
const pc = chalk;

// Truecolor support: most modern terminals (Windows Terminal, iTerm, VS Code) have it.
export const TRUECOLOR =
  chalk.level > 0 &&
  (chalk.level >= 3 ||
    process.env.COLORTERM === "truecolor" ||
    process.env.COLORTERM === "24bit" ||
    process.env.WT_SESSION ||
    process.env.TERM_PROGRAM === "vscode" ||
    process.env.TERM_PROGRAM === "iTerm.app");

// Brand gradient: violet -> blue -> cyan
const STOPS = [
  [168, 85, 247],
  [99, 102, 241],
  [34, 211, 238],
];

function lerp(a, b, t) {
  return Math.round(a + (b - a) * t);
}

function colorAt(t) {
  const seg = t * (STOPS.length - 1);
  const i = Math.min(Math.floor(seg), STOPS.length - 2);
  const local = seg - i;
  const [a, b] = [STOPS[i], STOPS[i + 1]];
  return [lerp(a[0], b[0], local), lerp(a[1], b[1], local), lerp(a[2], b[2], local)];
}

export function gradient(text) {
  if (!TRUECOLOR) return pc.magenta(text);
  const chars = [...text];
  const n = Math.max(chars.length - 1, 1);
  return (
    chars
      .map((ch, i) => {
        if (ch === " ") return ch;
        const [r, g, b] = colorAt(i / n);
        return `\x1b[38;2;${r};${g};${b}m${ch}`;
      })
      .join("") + "\x1b[0m"
  );
}

const LOGO = [
  "     _           _     _  _        _                ",
  "  __| | __ _ ___| |__ | || |    __| | _____   _____ ",
  " / _` |/ _` / __| '_ \\| || |_  / _` |/ _ \\ \\ / / __|",
  "| (_| | (_| \\__ \\ | | |__   _|| (_| |  __/\\ V /\\__ \\",
  " \\__,_|\\__,_|___/_| |_|  |_|   \\__,_|\\___| \\_/ |___/",
];

const purple = (s) => (TRUECOLOR ? `\x1b[38;2;168;85;247m${s}\x1b[39m` : pc.magenta(s));

// Cyan logo with a bright band that sweeps across it (t = 0..1). t >= 1 = plain cyan.
function shimmer(line, t) {
  if (t >= 1 || t < 0) return pc.cyan(line);
  const center = t * (line.length + 16) - 8;
  return line
    .split("")
    .map((ch, i) => {
      if (ch === " ") return ch;
      const d = Math.abs(i - center);
      if (d < 2) return pc.bold(pc.white(ch));
      if (d < 5) return TRUECOLOR ? `\x1b[38;2;165;243;252m${ch}\x1b[39m` : pc.bold(pc.cyan(ch));
      return pc.cyan(ch);
    })
    .join("");
}

const logoBlock = (version, t) => [
  "",
  ...LOGO.map((l) => shimmer(l, t)),
  "",
  pc.bold(pc.cyan(`v${version}`)),
  purple("By CodeCraft Studios LLC"),
];

export async function banner(version) {
  const { animatedHero, DOG_WIDTH } = await import("./mascot.js");
  const cols = process.stdout.columns || 80;
  console.log("");
  if (cols >= DOG_WIDTH + LOGO[0].length + 6) {
    await animatedHero((t) => logoBlock(version, t));
  } else {
    // narrow terminal: logo on top, Biscuit below
    for (const l of logoBlock(version, 1)) console.log("  " + l);
    await animatedHero(() => []);
  }
  console.log("");
}

// eslint-disable-next-line no-control-regex -- matching ANSI colour codes is the point
export const stripAnsi = (s) => s.replace(/\x1b\[[0-9;]*m/g, "");

export function box(lines, { title, color = pc.cyan } = {}) {
  const width = Math.max(...lines.map((l) => stripAnsi(l).length), title ? stripAnsi(title).length + 2 : 0) + 2;
  const top = title
    ? color("╭─ ") + pc.bold(title) + " " + color("─".repeat(Math.max(width - stripAnsi(title).length - 3, 0)) + "╮")
    : color("╭" + "─".repeat(width) + "╮");
  const body = lines.map((l) => color("│") + " " + l + " ".repeat(width - stripAnsi(l).length - 1) + color("│"));
  const bottom = color("╰" + "─".repeat(width) + "╯");
  console.log(["", top, ...body, bottom, ""].map((l) => "  " + l).join("\n"));
}

export const badge = {
  hipaa: () => pc.bgGreen(pc.black(pc.bold(" HIPAA "))),
  preview: () => pc.bgYellow(pc.black(pc.bold(" PREVIEW "))),
  ok: () => pc.bgCyan(pc.black(pc.bold(" OK "))),
  own: () => pc.bgMagenta(pc.white(pc.bold(" OWN DB "))),
};

export const sym = {
  ok: pc.green("✔"),
  warn: pc.yellow("▲"),
  err: pc.red("✖"),
  dot: pc.dim("•"),
  arrow: pc.cyan("›"),
};

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export { pc };
