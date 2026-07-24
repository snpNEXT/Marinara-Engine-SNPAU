import { createHash } from "node:crypto";
import type { PersonalExtensionRuntime } from "@marinara-engine/shared";

export type PersonalExtensionExecutable = {
  runtime: PersonalExtensionRuntime;
  css?: string | null;
  js?: string | null;
  serverJs?: string | null;
};

export function computePersonalExtensionHash(extension: PersonalExtensionExecutable): string {
  const payload =
    extension.runtime === "server"
      ? ["server", "", "", extension.serverJs ?? ""]
      : ["client", extension.css ?? "", extension.js ?? "", ""];
  return `sha256:${createHash("sha256").update(JSON.stringify(payload), "utf8").digest("hex")}`;
}
