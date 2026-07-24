import { useCallback, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { findEnglishMessageKey } from "./i18n";

export function useLocalizedUiText() {
  const { t } = useTranslation();

  return useCallback(
    (englishText: string): string => {
      const key = findEnglishMessageKey(englishText);
      return key ? t(key) : englishText;
    },
    [t],
  );
}

export function localizeStringNode(node: ReactNode, localize: (englishText: string) => string): ReactNode {
  return typeof node === "string" ? localize(node) : node;
}
