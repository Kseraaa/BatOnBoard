'use client';

import type { Locale } from '@batonboard/ui';
import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import { en } from './en';
import { th } from './th';
import type { Messages } from './th';

export const DEFAULT_LOCALE: Locale = 'th';
export const messages: Record<Locale, Messages> = { th, en };

const LocaleContext = createContext<Locale>(DEFAULT_LOCALE);

/** สลับภาษาในเฟส 2 — ตอนนี้ใช้ภาษาเริ่มต้นเสมอ */
export function I18nProvider({
  locale = DEFAULT_LOCALE,
  children,
}: {
  locale?: Locale;
  children: ReactNode;
}) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}

export function useLocale(): Locale {
  return useContext(LocaleContext);
}

export function useT(): Messages {
  return messages[useLocale()];
}

export function errorText(m: Messages, code: string): string {
  return m.errors[code] ?? m.errors.unknown ?? code;
}
