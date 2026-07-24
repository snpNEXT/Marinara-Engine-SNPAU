import { createInstance, type TOptions } from "i18next";
import { initReactI18next } from "react-i18next";
import englishLocale from "./locales/en.json";
import {
  APP_LANGUAGE_OPTIONS,
  loadLocaleResource,
  normalizeLocaleResource,
  resolveSupportedLocale,
} from "./locale-loader";
import { DEFAULT_APP_LANGUAGE, type AppLanguage, type LocaleMetadata } from "./locale-types";

const english = normalizeLocaleResource(DEFAULT_APP_LANGUAGE, englishLocale);
const loadedMetadata = new Map<string, LocaleMetadata>([[DEFAULT_APP_LANGUAGE, english.metadata]]);
const englishMessageKeys = new Map<string, string>();

for (const [key, message] of Object.entries(english.messages)) {
  if (!englishMessageKeys.has(message)) {
    englishMessageKeys.set(message, key);
  }
}

export const i18n = createInstance();

const initialization = i18n.use(initReactI18next).init({
  resources: {
    [DEFAULT_APP_LANGUAGE]: {
      translation: english.messages,
    },
  },
  lng: DEFAULT_APP_LANGUAGE,
  fallbackLng: DEFAULT_APP_LANGUAGE,
  supportedLngs: APP_LANGUAGE_OPTIONS.map((option) => option.id),
  load: "currentOnly",
  keySeparator: false,
  nsSeparator: false,
  returnNull: false,
  interpolation: {
    escapeValue: false,
  },
  react: {
    useSuspense: false,
  },
  initAsync: false,
});

let activationRevision = 0;

function syncDocumentLocale(locale: string, metadata: LocaleMetadata) {
  if (typeof document === "undefined") return;
  document.documentElement.lang = locale;
  document.documentElement.dir = metadata.direction;
}

function syncDocumentTitle() {
  if (typeof document === "undefined") return;
  document.title = i18n.t("app.documentTitle");
}

export async function activateLocale(requestedLocale: unknown): Promise<AppLanguage> {
  const requestRevision = ++activationRevision;
  await initialization;

  let locale = resolveSupportedLocale(requestedLocale);
  try {
    if (!i18n.hasResourceBundle(locale, "translation")) {
      const resource = await loadLocaleResource(locale);
      i18n.addResourceBundle(locale, "translation", resource.messages, true, true);
      loadedMetadata.set(locale, resource.metadata);
    }
  } catch (error) {
    console.error(`[localization] Could not load ${locale}; falling back to English`, error);
    locale = DEFAULT_APP_LANGUAGE;
  }

  if (requestRevision !== activationRevision) {
    return locale;
  }

  const metadata = loadedMetadata.get(locale) ?? english.metadata;
  syncDocumentLocale(locale, metadata);
  await i18n.changeLanguage(locale);
  syncDocumentTitle();
  return locale;
}

export async function initializeLocalization(requestedLocale: unknown): Promise<AppLanguage> {
  return activateLocale(requestedLocale);
}

export function translate(key: string, options?: TOptions): string {
  return String(i18n.t(key, options));
}

/**
 * Finds the semantic catalog key for an exact canonical-English UI message.
 *
 * This is a migration bridge for shared primitives that still receive legacy
 * English labels as props. New UI should call t("semantic.key") directly.
 */
export function findEnglishMessageKey(message: string): string | undefined {
  return englishMessageKeys.get(message);
}
