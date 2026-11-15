// Biscuit, the dash4devs golden retriever.
import { pc, TRUECOLOR, sleep, stripAnsi } from "./ui.js";

const rgb = (r, g, b, fallback) => (s) => (TRUECOLOR ? `\x1b[38;2;${r};${g};${b}m${s}\x1b[39m` : fallback(s));
const gold = rgb(232, 170, 66, pc.yellow);
const cream = rgb(250, 214, 150, pc.yellow);
const pink = rgb(244, 114, 182, pc.magenta);

// Biscuit sitting, facing right. The tail area (left side, rows 4-8) is drawn by the overlays below.
const BASE = [
  "                ,-.__        ",
  "              ,'    @ `-.___  ",
  "             (  ,)        O) ",
  "              \\/ \\  (_____/  ",
  "               |  `--' U     ",
  "              /     \\        ",
  "             /       \\       ",
  "          __/   |  |  \\      ",
  "         (______|__|___)     ",
];

// Tail overlays: non-space characters replace the base. Played 0,1,2,1 = a wag.
const TAILS = [
  { 4: "  \\\\", 5: "   \\\\", 6: "    \\\\", 7: "      \\\\__" },
  { 6: "  ___", 7: "     `--.__" },
  { 7: "", 8: " `-------" },
];

export const DOG_WIDTH = BASE[0].length;
export const DOG_HEIGHT = BASE.length;

function overlay(line, top) {
  const chars = line.split("");
  for (let i = 0; i < top.length; i++) if (top[i] !== " ") chars[i] = top[i];
  return chars.join("");
}

/** One frame of Biscuit. tail: 0..2, blink: eyes shut, pant: tongue in/out. */
export function dogFrame(tail = 0, { blink = false, pant = false } = {}) {
  return BASE.map((line, row) => {
    const t = TAILS[tail][row] || "";
    let l = overlay(line, t);
    if (blink) l = l.replace("@", "-");
    if (pant) l = l.replace(" U ", " u ");
    return l
      .split("")
      .map((ch, col) => {
        if (ch === " ") return ch;
        if (col < t.length && t[col] !== " ") return cream(ch); // tail
        if (row === 1 && (ch === "@" || ch === "-")) return pc.bold(pc.white(ch)); // eye
        if (row === 2 && ch === "O") return pc.bold(pc.gray(ch)); // nose
        if (row === 4 && (ch === "U" || ch === "u")) return pink(ch); // tongue
        return gold(ch);
      })
      .join("");
  });
}

const canAnimate = () =>
  process.stdout.isTTY && !process.env.CI && !process.env.DASH4DEVS_NO_ANIM && process.env.TERM !== "dumb";

const visibleLen = (s) => stripAnsi(s).length;

function sideBySide(left, right, gap = 2) {
  const h = Math.max(left.length, right.length);
  const out = [];
  for (let i = 0; i < h; i++) {
    const l = left[i] || " ".repeat(DOG_WIDTH);
    out.push("  " + l + " ".repeat(Math.max(DOG_WIDTH - visibleLen(l), 0) + gap) + (right[i] || ""));
  }
  return out;
}

function draw(lines, first) {
  if (!first) process.stdout.write(`\x1b[${lines.length}A`);
  process.stdout.write(lines.map((l) => "\x1b[2K" + l).join("\n") + "\n");
}

async function withHiddenCursor(fn) {
  const show = () => process.stdout.write("\x1b[?25h");
  process.stdout.write("\x1b[?25l");
  process.once("exit", show);
  try {
    await fn();
  } finally {
    show();
  }
}

const WAG = [0, 1, 2, 1];

/** Biscuit beside a block of text. rightLines(t) builds the text for animation progress t (0..1). */
export async function animatedHero(rightLines, { frames = 20, ms = 80 } = {}) {
  if (!canAnimate()) {
    console.log(sideBySide(dogFrame(0), rightLines(1)).join("\n"));
    return;
  }
  await withHiddenCursor(async () => {
    for (let f = 0; f < frames; f++) {
      const dog = dogFrame(WAG[f % 4], { blink: f === 12 || f === 13, pant: f % 2 === 1 });
      draw(sideBySide(dog, rightLines(f / (frames - 1))), f === 0);
      await sleep(ms);
    }
    draw(sideBySide(dogFrame(0), rightLines(1)), false);
  });
}

/** Biscuit says something in a speech bubble while wagging. */
export async function dogSays(message, { frames = 12, ms = 85 } = {}) {
  const w = visibleLen(message) + 2;
  // bubble points left at Biscuit's face (row 1)
  const right = [
    pc.dim("  ╭" + "─".repeat(w) + "╮"),
    pc.dim("──┤") + " " + message + " " + pc.dim("│"),
    pc.dim("  ╰" + "─".repeat(w) + "╯"),
  ];
  if (!canAnimate()) {
    console.log(sideBySide(dogFrame(0), right).join("\n"));
    return;
  }
  await withHiddenCursor(async () => {
    for (let f = 0; f < frames; f++) {
      draw(sideBySide(dogFrame(WAG[f % 4], { pant: f % 2 === 1 }), right), f === 0);
      await sleep(ms);
    }
    draw(sideBySide(dogFrame(0), right), false);
  });
}

/** A little pup chasing a ball across one line (plays once, then clears). */
export async function fetchRun(label = "") {
  if (!canAnimate()) return;
  const width = 46;
  await withHiddenCursor(async () => {
    for (let x = 0; x <= width; x += 2) {
      const pup = gold(x % 4 === 0 ? "∪･ω･∪" : "∪･ᴥ･∪");
      const ballAt = Math.min(x + 9, width + 6);
      const ball = pc.green("●");
      const line = "  " + " ".repeat(x) + pup + " ".repeat(Math.max(ballAt - x - 5, 1)) + ball + "   " + pc.dim(label);
      process.stdout.write("\r\x1b[2K" + line);
      await sleep(30);
    }
    process.stdout.write("\r\x1b[2K");
  });
}
