// ──────────────────────────────────────────────
// Personal Extension Types
// ──────────────────────────────────────────────

export type PersonalExtensionRuntime = "client" | "server";

export type PersonalExtensionSource = "external" | "local" | "professor_mari" | "legacy" | "profile_import";

export type PersonalExtensionSandboxBackend = "browser-opaque-origin" | "macos-seatbelt" | "linux-bubblewrap";

export const PERSONAL_EXTENSION_CONTRIBUTION_KINDS = ["button", "menu-item", "panel"] as const;
export type PersonalExtensionContributionKind = (typeof PERSONAL_EXTENSION_CONTRIBUTION_KINDS)[number];

export const PERSONAL_EXTENSION_CONTRIBUTION_ICONS = [
  "bot",
  "book",
  "database",
  "gamepad",
  "heart",
  "image",
  "message",
  "music",
  "puzzle",
  "settings",
  "sparkles",
  "star",
  "tool",
  "wand",
  "zap",
] as const;
export type PersonalExtensionContributionIcon = (typeof PERSONAL_EXTENSION_CONTRIBUTION_ICONS)[number];

export const PERSONAL_EXTENSION_UI_ELEMENT_KINDS = [
  "heading",
  "text",
  "pre",
  "button",
  "input",
  "select",
  "toggle",
  "slider",
  "color",
  "spacer",
] as const;
export type PersonalExtensionUiElementKind = (typeof PERSONAL_EXTENSION_UI_ELEMENT_KINDS)[number];

export const PERSONAL_EXTENSION_UI_LIMITS = {
  contributionsPerExtension: 24,
  panelElements: 60,
  idLength: 64,
  labelLength: 80,
  descriptionLength: 240,
  textLength: 8_000,
  totalPanelTextLength: 32_000,
  selectOptions: 100,
} as const;

export type PersonalExtensionUiElement =
  | { kind: "heading" | "text" | "pre"; text: string }
  | { kind: "button"; id: string; label: string }
  | {
      kind: "input";
      id: string;
      label?: string;
      placeholder?: string;
      value?: string;
      multiline?: boolean;
    }
  | {
      kind: "select";
      id: string;
      label?: string;
      value?: string;
      options: Array<{ value: string; label: string }>;
    }
  | { kind: "toggle"; id: string; label: string; checked?: boolean }
  | {
      kind: "slider";
      id: string;
      label?: string;
      min: number;
      max: number;
      step?: number;
      value?: number;
    }
  | { kind: "color"; id: string; label?: string; value?: string }
  | { kind: "spacer" };

export interface PersonalExtensionContributionDescriptor {
  id: string;
  kind: PersonalExtensionContributionKind;
  label: string;
  description?: string;
  icon?: PersonalExtensionContributionIcon;
  elements?: PersonalExtensionUiElement[];
}

export interface PersonalExtensionHostContribution extends PersonalExtensionContributionDescriptor {
  key: string;
  extensionId: string;
  extensionName: string;
  contentHash: string;
}

export interface PersonalExtensionPolicy {
  externalExtensionsEnvEnabled: boolean;
  externalExtensionsEnabled: boolean;
  serverSandboxAvailable: boolean;
  serverSandboxBackend: Exclude<PersonalExtensionSandboxBackend, "browser-opaque-origin"> | null;
  serverSandboxReason: string | null;
}

export interface PersonalExtensionRevision {
  contentHash: string;
  version: string | null;
  runtime: PersonalExtensionRuntime;
  css: string | null;
  js: string | null;
  serverJs: string | null;
  savedAt: string;
}

/**
 * User-owned code stored by Marinara.
 *
 * Browser code runs in an opaque-origin sandboxed iframe with a message-only
 * capability API. Server code runs in a separate OS-sandboxed process with
 * Node permissions enabled. Unsupported server platforms fail closed.
 * Execution is allowed only while the stored executable bytes still match the
 * exact approved SHA-256 hash.
 */
export interface PersonalExtension {
  id: string;
  name: string;
  version: string | null;
  description: string;
  runtime: PersonalExtensionRuntime;
  css: string | null;
  js: string | null;
  serverJs: string | null;
  enabled: boolean;
  contentHash: string;
  approvedHash: string | null;
  source: PersonalExtensionSource;
  revisions: PersonalExtensionRevision[];
  serverStatus?: "running" | "stopped" | "error";
  serverError?: string | null;
  installedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface PersonalClientExtensionRuntime {
  id: string;
  name: string;
  description: string;
  contentHash: string;
  sandboxUrl: string;
}
