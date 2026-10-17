/*
 * Third-party locale data, loaded on demand with the language: dayjs (date
 * pickers, calendars, relative dates) and antd (component texts).
 */
import dayjs from 'dayjs';
import { languageInfo } from './languages';

const DAYJS = {
  'en-gb': () => import('dayjs/locale/en-gb'),
  ru: () => import('dayjs/locale/ru'),
  ky: () => import('dayjs/locale/ky'),
  tr: () => import('dayjs/locale/tr'),
  'zh-cn': () => import('dayjs/locale/zh-cn'),
};

const ANTD = {
  en_GB: () => import('antd/es/locale/en_GB'),
  ru_RU: () => import('antd/es/locale/ru_RU'),
  // antd has no Kyrgyz locale: our own (./antd-ky_KG.js).
  ky_KG: () => import('./antd-ky_KG'),
  tr_TR: () => import('antd/es/locale/tr_TR'),
  zh_CN: () => import('antd/es/locale/zh_CN'),
};

const antdCache = new Map();

/** Loads the dayjs and antd locales of a language; resolves to the antd locale object. */
export async function loadVendorLocales(code) {
  const info = languageInfo(code);
  const [antd] = await Promise.all([
    antdCache.get(info.antd) || (ANTD[info.antd] ? ANTD[info.antd]().then((mod) => mod.default) : Promise.resolve(undefined)),
    DAYJS[info.dayjs] && !dayjs.Ls[info.dayjs] ? DAYJS[info.dayjs]() : null,
  ]);
  if (antd) antdCache.set(info.antd, antd);
  return antd;
}

/** dayjs locale name of a language when it is loaded, else plain English. */
export function dayjsLocale(code) {
  const name = languageInfo(code).dayjs;
  return dayjs.Ls[name] ? name : 'en';
}
