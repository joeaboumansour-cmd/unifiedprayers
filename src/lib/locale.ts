import type { Lang } from "@/lib/content";

/**
 * The locale every reader-facing Intl formatter should be given.
 *
 * Arabic names its digits outright. Plain "ar" used to imply Arabic-Indic
 * numerals, but current CLDR data gives Arabic *Latin* digits by default, so
 * every `Intl.*("ar")` in the app was quietly printing "11 سبتمبر" where it
 * meant "١١ سبتمبر". `-u-nu-arab` asks for ١٢٣ by name and cannot drift.
 */
export const intlLocale = (lang: Lang): string => (lang === "ar" ? "ar-u-nu-arab" : "en");

/** A bare number in the reader's digits, without grouping — years, days, weeks. */
export const formatNum = (n: number, lang: Lang): string =>
  new Intl.NumberFormat(intlLocale(lang), { useGrouping: false }).format(n);
