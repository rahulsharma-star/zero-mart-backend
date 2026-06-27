import en from './en.json';
import hi from './hi.json';
import mr from './mr.json';

export type Lang = 'en' | 'hi' | 'mr';
export const SUPPORTED_LANGS: Lang[] = ['en', 'hi', 'mr'];
export const DEFAULT_LANG: Lang = 'en';

const dictionaries: Record<Lang, Record<string, string>> = { en, hi, mr };

/** Translate a message key for the given language, with {placeholder} substitution. */
export function t(key: string, lang: Lang = DEFAULT_LANG, vars?: Record<string, string | number>): string {
  const dict = dictionaries[lang] ?? dictionaries[DEFAULT_LANG];
  let msg = dict[key] ?? dictionaries[DEFAULT_LANG][key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      msg = msg.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    }
  }
  return msg;
}

export function normalizeLang(input?: string | null): Lang {
  if (!input) return DEFAULT_LANG;
  const code = input.toLowerCase().split('-')[0].split(',')[0].trim();
  return (SUPPORTED_LANGS as string[]).includes(code) ? (code as Lang) : DEFAULT_LANG;
}

/** Localize a multilingual JSON field { en, hi } down to a single string. */
export function localizeField(value: unknown, lang: Lang): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object') {
    const obj = value as Record<string, string>;
    return obj[lang] ?? obj[DEFAULT_LANG] ?? Object.values(obj)[0] ?? '';
  }
  return String(value);
}
