/* global console, process */
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(__dirname, "..");
const LOW_MEMORY_BUILD = process.platform === "android" || process.env.MARINARA_LOW_MEMORY_BUILD === "1";

function run(command, args, options = {}) {
  const isWin = process.platform === "win32";
  const safeCommand = isWin && command.includes(" ") ? `"${command}"` : command;
  const result = spawnSync(safeCommand, args, {
    cwd: PACKAGE_ROOT,
    env: { ...process.env, ...options.env },
    shell: isWin,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

if (LOW_MEMORY_BUILD) {
  console.log("[build] Android/low-memory client build: skipping tsc and PWA generation.");
  run("vite", ["build"], { env: { SKIP_PWA: "1" } });
} else {
  run("tsc", ["-b"]);
  run("vite", ["build"]);
}
