import type { TextDirection } from "@marinara-engine/shared";
import englishLocale from "./locales/en.json";
import {
  DEFAULT_APP_LANGUAGE,
  type AppLanguage,
  type LoadedLocale,
  type LocaleDescriptor,
  type LocaleMetadata,
} from "./locale-types";

type LocaleModule = { default: unknown };
type LocaleModuleLoader = () => Promise<LocaleModule>;

const localeModules = import.meta.glob<LocaleModule>(["./locales/*.json", "!./locales/en.json"]);
const localeLoaders = new Map<string, LocaleModuleLoader>();
localeLoaders.set(DEFAULT_APP_LANGUAGE, async () => ({ default: englishLocale }));

function canonicalizeLocale(value: string): string | null {
  try {
    return Intl.getCanonicalLocales(value.trim())[0] ?? null;
  } catch {
    return null;
  }
}

function localeFromModulePath(path: string): string | null {
  const match = /\/([^/]+)\.json$/u.exec(path);
  return match ? canonicalizeLocale(match[1]) : null;
}

for (const [path, loader] of Object.entries(localeModules)) {
  const locale = localeFromModulePath(path);
  if (!locale) {
    throw new Error(`Invalid localization filename: ${path}`);
  }
  if (localeLoaders.has(locale)) {
    throw new Error(`Duplicate localization locale: ${locale}`);
  }
  localeLoaders.set(locale, loader);
}

if (!localeLoaders.has(DEFAULT_APP_LANGUAGE)) {
  throw new Error(`Missing canonical ${DEFAULT_APP_LANGUAGE}.json localization file`);
}

function getNativeLanguageName(locale: string): string {
  try {
    return new Intl.DisplayNames([locale], { type: "language" }).of(locale) ?? locale;
  } catch {
    return locale;
  }
}

export const APP_LANGUAGE_OPTIONS: readonly LocaleDescriptor[] = Object.freeze(
  [...localeLoaders.keys()]
    .map((id) => ({ id, label: getNativeLanguageName(id) }))
    .sort((left, right) => {
      if (left.id === DEFAULT_APP_LANGUAGE) return -1;
      if (right.id === DEFAULT_APP_LANGUAGE) return 1;
      return left.label.localeCompare(right.label, left.id);
    }),
);

export function resolveSupportedLocale(value: unknown): AppLanguage {
  if (typeof value !== "string") return DEFAULT_APP_LANGUAGE;
  const locale = canonicalizeLocale(value);
  return locale && localeLoaders.has(locale) ? locale : DEFAULT_APP_LANGUAGE;
}

function normalizeDirection(value: unknown): TextDirection | null {
  return value === "ltr" || value === "rtl" ? value : null;
}

export function normalizeLocaleResource(locale: string, input: unknown): LoadedLocale {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error(`${locale}.json must contain a JSON object`);
  }

  const resource = input as Record<string, unknown>;
  const rawMetadata = resource._meta;
  if (!rawMetadata || typeof rawMetadata !== "object" || Array.isArray(rawMetadata)) {
    throw new Error(`${locale}.json is missing its _meta object`);
  }

  const metadataValue = rawMetadata as Record<string, unknown>;
  const metadataLocale = typeof metadataValue.locale === "string" ? canonicalizeLocale(metadataValue.locale) : null;
  const direction = normalizeDirection(metadataValue.direction);
  if (metadataLocale !== locale || !direction) {
    throw new Error(`${locale}.json has invalid locale metadata`);
  }

  const messages: Record<string, string> = {};
  for (const [key, value] of Object.entries(resource)) {
    if (key === "_meta") continue;
    if (typeof value !== "string" || !value.trim()) {
      throw new Error(`${locale}.json key ${key} must contain non-empty text`);
    }
    messages[key] = value;
  }

  const metadata: LocaleMetadata = { locale, direction };
  return { metadata, messages };
}

export async function loadLocaleResource(value: unknown): Promise<LoadedLocale> {
  const locale = resolveSupportedLocale(value);
  const loader = localeLoaders.get(locale);
  if (!loader) {
    throw new Error(`Localization file is unavailable for ${locale}`);
  }
  const module = await loader();
  return normalizeLocaleResource(locale, module.default);
}
