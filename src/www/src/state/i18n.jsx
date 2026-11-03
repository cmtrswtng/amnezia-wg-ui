import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import messages from "../locales/messages";
import admin from "../locales/admin";
import { api } from "../api/client";

const I18nContext = createContext(null);
const readSaved = () => {
  try {
    return localStorage.getItem("lang");
  } catch {
    return null;
  }
};
const availableLocales = Object.keys(messages);
const lookup = (object, key) =>
  key.split(".").reduce((value, part) => value?.[part], object);
export function I18nProvider({ children }) {
  const [locale, setLanguage] = useState(() =>
    availableLocales.includes(readSaved()) ? readSaved() : "en",
  );
  const setLocale = useCallback((value) => {
    if (!availableLocales.includes(value)) return;
    setLanguage(value);
    try {
      localStorage.setItem("lang", value);
    } catch {
      /* preference storage can be unavailable */
    }
  }, []);
  useEffect(() => {
    let active = true;
    if (!readSaved())
      api
        .getLang()
        .then((value) => {
          if (active && !readSaved()) setLocale(value);
        })
        .catch(() => {});
    return () => {
      active = false;
    };
  }, [setLocale]);
  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = ["ar", "he", "fa"].includes(locale)
      ? "rtl"
      : "ltr";
  }, [locale]);
  const t = useCallback(
    (key, params = {}) => {
      const value =
        lookup(admin[locale], key) ??
        lookup(messages[locale], key) ??
        lookup(admin.en, key) ??
        lookup(messages.en, key) ??
        key;
      return typeof value === "string"
        ? value.replace(/\{(\w+)\}/g, (match, name) => params[name] ?? match)
        : key;
    },
    [locale],
  );
  const value = useMemo(
    () => ({ locale, setLocale, availableLocales, t }),
    [locale, setLocale, t],
  );
  return <I18nContext value={value}>{children}</I18nContext>;
}
export const useI18n = () => useContext(I18nContext);
