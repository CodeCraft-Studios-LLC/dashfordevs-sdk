#!/usr/bin/env node
/**
 * dash4devs CLI entry.
 *
 * Subcommands:
 *   dash4devs init [dir]      Scaffold a new Next.js storefront wired to the SDK
 *   dash4devs build           Build Next.js app and upload static assets to CDN
 *   dash4devs deploy          Alias for build + activate
 *   dash4devs status          Show current active deployment
 *   dash4devs media           Size media/ into public/_media for DashImage/DashVideo
 *   dash4devs purge <paths>   Invalidate edge cache for one or more paths
 *   dash4devs rollback <id>   Activate a previous deployment
 *
 * Account + project setup (merged from dash4devs-cli; lazy-loaded so build/deploy/media never load it):
 *   dash4devs create [dir]    Log in, pick an org, get keys, scaffold a project (with options)
 *   dash4devs login | logout | whoami
 *   dash4devs setup           Set up an existing folder (dash4devs.config.json)
 *   dash4devs site            Show this folder's setup
 *
 * Auth:
 *   Reads DASH4DEVS_API_KEY from env (falls back to .env.local / .env).
 *   Must be a secret key (sk_live_* or sk_test_*). `init` prompts for keys.
 */

// Suppress Node process warnings (e.g. the NODE_TLS_REJECT_UNAUTHORIZED notice
// emitted when hitting a local self-signed backend) — they print mid-line and
// garble the progress bars. Keep the CLI output clean.
process.removeAllListeners("warning");
process.on("warning", () => {});

import { run as runBuild } from "./commands/build.js";
import { run as runStatus } from "./commands/status.js";
import { run as runInit } from "./commands/init.js";
import { run as runMedia } from "./commands/media.js";
import { printBanner, printError } from "./ui.js";

const COMMANDS = {
  init: runInit,
  build: runBuild,
  deploy: runBuild, // alias, activates by default
  status: runStatus,
  media: runMedia,
};

// Account + project setup commands: imported only when used.
const pm = (name, ...pre) => async (args) => (await import(`./pm/commands/${name}.js`)).run([...pre, ...args], await readVersion());
const PM_COMMANDS = {
  create: pm("create"),
  login: pm("login"),
  logout: pm("login", "logout"),
  whoami: pm("login", "whoami"),
  setup: pm("setup"),
  site: pm("site"),
};

async function readVersion() {
  try {
    return (await import("../version.js")).SDK_VERSION;
  } catch {
    return "";
  }
}

async function main() {
  const [, , cmd, ...rest] = process.argv;

  if (cmd === "-v" || cmd === "--version") {
    console.log(await readVersion());
    process.exit(0);
  }

  const showHelp = !cmd || cmd === "-h" || cmd === "--help";
  if (showHelp) {
    printBanner();
    console.log(`
Usage: dash4devs <command> [options]

Commands:
  init [dir]            Scaffold a new storefront (prompts for keys)
  build                 Build Next.js and upload static assets
  deploy                Build + activate in one step
  status                Show active deployment for this org
  media                 Size the site's own images/videos (media.config.mjs)

Account + projects (preview):
  create [dir]          Log in, pick an org, get keys, scaffold a project
  login                 Log in to DashForDevs in your browser
  logout | whoami       Log out / show who's logged in
  setup                 Set up an existing folder (dash4devs.config.json)
  site                  Show this folder's setup

Environment:
  DASH4DEVS_API_KEY     Secret key (sk_*) for your organization
  DASH4DEVS_API_URL     Override API URL (default: https://api.dashfordevs.com)
  DASH4DEVS_TARGET      production | papi (used when no API URL is set)
  DASH4DEVS_NO_ANIM     Set to turn off Biscuit's animations
`);
    process.exit(0);
  }

  const handler = COMMANDS[cmd] || PM_COMMANDS[cmd];
  if (!handler) {
    printError(`Unknown command: ${cmd}`);
    process.exit(1);
  }

  try {
    await handler(rest);
  } catch (err) {
    printError(err.message || String(err));
    if (process.env.DASH4DEVS_DEBUG) console.error(err);
    process.exit(1);
  }
}

main();
