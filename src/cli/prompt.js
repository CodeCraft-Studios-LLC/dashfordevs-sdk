/**
 * Tiny interactive prompt helpers built on node:readline — keeps the CLI
 * dependency-light (no inquirer/prompts). Supports text, masked secrets,
 * yes/no, and validated input.
 */

import readline from "node:readline";
import chalk from "chalk";

function createRl() {
  return readline.createInterface({ input: process.stdin, output: process.stdout });
}

const Q = chalk.cyan("?");

/** Ask a free-text question. Returns the (trimmed) answer or the default. */
export function ask(question, { def = "", validate } = {}) {
  return new Promise((resolve) => {
    const rl = createRl();
    const hint = def ? chalk.dim(` (${def})`) : "";
    const doAsk = () => {
      rl.question(`${Q} ${question}${hint} `, (answer) => {
        const value = (answer || "").trim() || def;
        if (validate) {
          const err = validate(value);
          if (err) {
            console.log(`  ${chalk.red("✗")} ${chalk.red(err)}`);
            return doAsk();
          }
        }
        rl.close();
        resolve(value);
      });
    };
    doAsk();
  });
}

/** Ask for a secret — input is masked with asterisks as it's typed. */
export function askSecret(question, { validate } = {}) {
  return new Promise((resolve) => {
    const rl = createRl();
    const doAsk = () => {
      const query = `${Q} ${question} `;
      // Mask keystrokes.
      const onData = (char) => {
        const s = char.toString();
        if (s === "\n" || s === "\r" || s === "") {
          process.stdin.removeListener("data", onData);
          return;
        }
        readline.clearLine(process.stdout, 0);
        readline.cursorTo(process.stdout, 0);
        process.stdout.write(query + "*".repeat(rl.line.length));
      };
      process.stdin.on("data", onData);
      rl.question(query, (answer) => {
        const value = (answer || "").trim();
        if (validate) {
          const err = validate(value);
          if (err) {
            console.log(`\n  ${chalk.red("✗")} ${chalk.red(err)}`);
            return doAsk();
          }
        }
        rl.close();
        process.stdout.write("\n");
        resolve(value);
      });
    };
    doAsk();
  });
}

/** Yes/no question. Returns boolean. */
export async function confirm(question, { def = true } = {}) {
  const suffix = def ? "Y/n" : "y/N";
  const answer = await ask(`${question} ${chalk.dim(`[${suffix}]`)}`, { def: def ? "y" : "n" });
  return /^y(es)?$/i.test(answer);
}
