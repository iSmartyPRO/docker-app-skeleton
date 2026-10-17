/*
 * Intl for languages the browser has no data for.
 *
 * Chromium ships a trimmed ICU without Kyrgyz: `Intl.DateTimeFormat('ky-KG')`,
 * `RelativeTimeFormat`, `NumberFormat` and `ListFormat` silently fall back to
 * English ("Saturday, October 17", "33 minutes ago", "1,234.5"). Firefox, Safari
 * and Node have the data. `installIntlFallbacks()` (main.jsx, before anything
 * else runs) checks each constructor with `supportedLocalesOf` and, only when a
 * language of FALLBACKS is missing, wraps it: a request for that language gets a
 * small formatter built on a related locale the browser has (numbers, numeric
 * dates, times) plus the language's own month, weekday and relative-time words.
 * Every other request goes to the browser's own Intl untouched. Because the
 * globals are wrapped, every caller is covered — our code (lib/format.js,
 * lib/datetime.js, `toLocaleDateString(localeTag(locale), …)`), FullCalendar
 * and anything else that formats through Intl.
 *
 * The texts below are CLDR's (the same Node prints), so server and browser agree.
 */

const KY = {
  base: 'ru-RU', // same digits, separators and 24-hour time
  months: {
    long: ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'],
    short: ['янв.', 'фев.', 'мар.', 'апр.', 'май', 'июн.', 'июл.', 'авг.', 'сен.', 'окт.', 'ноя.', 'дек.'],
    narrow: ['Я', 'Ф', 'М', 'А', 'М', 'И', 'И', 'А', 'С', 'О', 'Н', 'Д'],
  },
  // A month on its own ("Октябрь" as a calendar title).
  monthsStandalone: {
    long: ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'],
    short: ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'],
    narrow: ['Я', 'Ф', 'М', 'А', 'М', 'И', 'И', 'А', 'С', 'О', 'Н', 'Д'],
  },
  weekdays: {
    long: ['жекшемби', 'дүйшөмбү', 'шейшемби', 'шаршемби', 'бейшемби', 'жума', 'ишемби'],
    short: ['жек.', 'дүй.', 'шейш.', 'шарш.', 'бейш.', 'жума', 'ишм.'],
    narrow: ['Ж', 'Д', 'Ш', 'Ш', 'Б', 'Ж', 'И'],
  },
  year: '-ж.', // 2026-ж.
  dayMonth: '-', // 17-октябрь
  relative: {
    // unit: [nominative, ablative, short]
    units: {
      second: ['секунд', 'секунддан', 'сек.'],
      minute: ['мүнөт', 'мүнөттөн', 'мүн.'],
      hour: ['саат', 'сааттан', 'саат.'],
      day: ['күн', 'күндөн', 'күн'],
      week: ['апта', 'аптадан', 'апт.'],
      month: ['ай', 'айдан', 'ай'],
      year: ['жыл', 'жылдан', 'жыл'],
      quarter: ['чейрек', 'чейректен', 'чейр.'],
    },
    past: 'мурун',
    future: 'кийин',
    auto: {
      second: { 0: 'азыр' },
      minute: { 0: 'ушул мүнөттө' },
      hour: { 0: 'ушул саатта' },
      day: { '-2': 'мурдагы күнү', '-1': 'кечээ', 0: 'бүгүн', 1: 'эртең', 2: 'бүрсүгүнү' },
      week: { '-1': 'өткөн аптада', 0: 'ушул аптада', 1: 'келерки аптада' },
      month: { '-1': 'өткөн айда', 0: 'бул айда', 1: 'эмдиги айда' },
      year: { '-1': 'былтыр', 0: 'быйыл', 1: 'эмдиги жылы' },
      quarter: { '-1': 'акыркы чейрек', 0: 'бул чейрек', 1: 'кийинки чейрек' },
    },
  },
  // Words of the base locale's output replaced in this language.
  list: { ' и ': ' жана ', ' или ': ' же ' },
  compact: { 'тыс.': 'миң' },
  currency: { KGS: 'сом' },
};

export const FALLBACKS = { ky: KY };

const DATE_FIELDS = ['weekday', 'era', 'year', 'month', 'day'];
const TIME_FIELDS = ['dayPeriod', 'hour', 'minute', 'second', 'fractionalSecondDigits', 'timeZoneName'];
const TEXT = new Set(['long', 'short', 'narrow']);

function requested(locales) {
  if (locales === undefined || locales === null) return [];
  if (typeof locales === 'string') return [locales];
  try {
    return Array.from(locales, (item) => String(item));
  } catch {
    return [String(locales)];
  }
}

/**
 * The fallback language a request is for, or null when the browser handles it:
 * the first requested tag the browser supports wins; a tag it does not support
 * whose language is in FALLBACKS gets the fallback.
 */
export function fallbackFor(Native, locales) {
  for (const tag of requested(locales)) {
    let supported = false;
    try {
      supported = Native.supportedLocalesOf([tag]).length > 0;
    } catch {
      return null; // invalid tag: let the browser throw its own error
    }
    if (supported) return null;
    const lang = tag.toLowerCase().split(/[-_]/)[0];
    if (FALLBACKS[lang]) return { lang, tag, data: FALLBACKS[lang] };
  }
  return null;
}

/** Explicit fields of dateStyle / timeStyle, so the pieces can be assembled. */
function expandStyles(options) {
  const out = { ...options };
  const { dateStyle, timeStyle } = out;
  delete out.dateStyle;
  delete out.timeStyle;
  if (dateStyle === 'full') Object.assign(out, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  else if (dateStyle === 'long') Object.assign(out, { year: 'numeric', month: 'long', day: 'numeric' });
  else if (dateStyle === 'medium') Object.assign(out, { year: 'numeric', month: 'short', day: 'numeric' });
  else if (dateStyle === 'short') Object.assign(out, { year: 'numeric', month: '2-digit', day: '2-digit' });
  if (timeStyle === 'full' || timeStyle === 'long') Object.assign(out, { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZoneName: 'short' });
  else if (timeStyle === 'medium') Object.assign(out, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  else if (timeStyle === 'short') Object.assign(out, { hour: '2-digit', minute: '2-digit' });
  return out;
}

const pick = (source, keys) => Object.fromEntries(keys.filter((key) => source[key] !== undefined).map((key) => [key, source[key]]));

/** Intl.DateTimeFormat for a fallback language. */
export function makeDateTimeFormat(Native) {
  return class FallbackDateTimeFormat {
    constructor(fallback, options = {}) {
      this.fallback = fallback;
      this.options = { ...(options || {}) };
      const o = expandStyles(this.options);
      if (![...DATE_FIELDS, ...TIME_FIELDS].some((key) => o[key] !== undefined)) Object.assign(o, { year: 'numeric', month: 'numeric', day: 'numeric' });
      this.fields = o;
      const zone = pick(o, ['timeZone']);
      const cycle = pick(o, ['hour12', 'hourCycle']);
      this.native = new Native(fallback.data.base, this.options); // validates options, resolvedOptions
      this.values = new Native('en-US', { ...zone, calendar: 'gregory', numberingSystem: 'latn', year: 'numeric', month: 'numeric', day: 'numeric', weekday: 'short' });
      const numeric = pick(o, ['year', 'month', 'day']);
      this.textMonth = TEXT.has(o.month);
      this.numericDate = !this.textMonth && Object.keys(numeric).length ? new Native(fallback.data.base, { ...zone, ...numeric }) : null;
      const time = pick(o, TIME_FIELDS);
      this.time = Object.keys(time).length ? new Native(fallback.data.base, { ...zone, ...cycle, ...time }) : null;
    }

    formatToParts(date) {
      const when = date === undefined ? Date.now() : date;
      this.native.format(when); // throws RangeError for an invalid date, like the browser
      const o = this.fields;
      const data = this.fallback.data;
      const raw = Object.fromEntries(this.values.formatToParts(when).map((part) => [part.type, part.value]));
      const year = o.year === '2-digit' ? String(Number(raw.year) % 100).padStart(2, '0') : raw.year;
      const month = Number(raw.month) - 1;
      const day = o.day === '2-digit' ? String(raw.day).padStart(2, '0') : String(Number(raw.day));
      const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(raw.weekday);
      const parts = [];
      const lit = (value) => parts.push({ type: 'literal', value });
      if (this.textMonth) {
        if (o.day) {
          if (o.year) {
            parts.push({ type: 'year', value: year });
            lit(`${data.year}, `);
          }
          parts.push({ type: 'day', value: day });
          lit(data.dayMonth);
          parts.push({ type: 'month', value: data.months[o.month][month] });
        } else if (o.year) {
          parts.push({ type: 'year', value: year });
          lit(o.month === 'long' ? `${data.year}, ` : `${data.year} `);
          parts.push({ type: 'month', value: data.months[o.month][month] });
        } else {
          parts.push({ type: 'month', value: data.monthsStandalone[o.month][month] });
        }
      } else if (this.numericDate) {
        if (o.year && !o.month && !o.day) parts.push({ type: 'year', value: year });
        else parts.push(...this.numericDate.formatToParts(when));
      }
      if (o.weekday && weekday >= 0) {
        if (parts.length) lit(', ');
        parts.push({ type: 'weekday', value: data.weekdays[o.weekday][weekday] });
      }
      if (this.time) {
        if (parts.length) lit(this.textMonth ? ' ' : ', ');
        parts.push(...this.time.formatToParts(when));
      }
      return parts;
    }

    format(date) {
      return this.formatToParts(date)
        .map((part) => part.value)
        .join('');
    }

    formatRange(start, end) {
      const a = this.format(start);
      const b = this.format(end);
      return a === b ? a : `${a} – ${b}`;
    }

    formatRangeToParts(start, end) {
      const a = this.formatToParts(start).map((part) => ({ ...part, source: 'startRange' }));
      const b = this.formatToParts(end).map((part) => ({ ...part, source: 'endRange' }));
      if (a.map((p) => p.value).join('') === b.map((p) => p.value).join('')) return a.map((part) => ({ ...part, source: 'shared' }));
      return [...a, { type: 'literal', value: ' – ', source: 'shared' }, ...b];
    }

    resolvedOptions() {
      return { ...this.native.resolvedOptions(), locale: this.fallback.tag };
    }
  };
}

/** Intl.NumberFormat for a fallback language: the base locale's digits and separators. */
export function makeNumberFormat(Native) {
  return class FallbackNumberFormat {
    constructor(fallback, options = {}) {
      this.fallback = fallback;
      this.options = { ...(options || {}) };
      this.native = new Native(fallback.data.base, this.options);
    }

    fix(parts) {
      const data = this.fallback.data;
      const out = [];
      for (const part of parts) {
        if (part.type === 'currency' && data.currency[part.value]) out.push({ ...part, value: data.currency[part.value] });
        else if (part.type === 'compact' && data.compact[part.value]) out.push({ ...part, value: data.compact[part.value] });
        else if (part.type === 'percentSign' && out.length && out[out.length - 1].type === 'literal' && /^\s+$/.test(out[out.length - 1].value)) {
          out.pop(); // "15%", not "15 %"
          out.push(part);
        } else out.push(part);
      }
      return out;
    }

    formatToParts(value) {
      return this.fix(this.native.formatToParts(value));
    }

    format(value) {
      return this.formatToParts(value)
        .map((part) => part.value)
        .join('');
    }

    formatRange(start, end) {
      return `${this.format(start)}–${this.format(end)}`;
    }

    resolvedOptions() {
      return { ...this.native.resolvedOptions(), locale: this.fallback.tag };
    }
  };
}

const UNIT = /^(second|minute|hour|day|week|month|quarter|year)s?$/;

/** Intl.RelativeTimeFormat for a fallback language. */
export function makeRelativeTimeFormat(NumberFormat) {
  return class FallbackRelativeTimeFormat {
    constructor(fallback, options = {}) {
      this.fallback = fallback;
      this.options = { numeric: 'always', style: 'long', ...(options || {}) };
      this.number = new NumberFormat(fallback.data.base);
    }

    formatToParts(value, unit) {
      const n = Number(value);
      const match = UNIT.exec(String(unit));
      if (!match || !Number.isFinite(n)) throw new RangeError(`Invalid unit or value: ${unit}`);
      const name = match[1];
      const rel = this.fallback.data.relative;
      if (this.options.numeric === 'auto') {
        const word = rel.auto[name]?.[Object.is(n, -0) ? '0' : String(n)];
        if (word) return [{ type: 'literal', value: word }];
      }
      const [nominative, ablative, short] = rel.units[name];
      const past = n < 0 || Object.is(n, -0);
      const word = this.options.style === 'long' ? (past ? nominative : ablative) : short;
      const digits = this.number.formatToParts(Math.abs(n)).map((part) => ({ ...part, unit: name }));
      return [...digits, { type: 'literal', value: ` ${word} ${past ? rel.past : rel.future}` }];
    }

    format(value, unit) {
      return this.formatToParts(value, unit)
        .map((part) => part.value)
        .join('');
    }

    resolvedOptions() {
      return { locale: this.fallback.tag, style: this.options.style, numeric: this.options.numeric, numberingSystem: 'latn' };
    }
  };
}

/** Intl.ListFormat for a fallback language: the base locale with its own "and" / "or". */
export function makeListFormat(Native) {
  return class FallbackListFormat {
    constructor(fallback, options = {}) {
      this.fallback = fallback;
      this.native = new Native(fallback.data.base, options);
    }

    formatToParts(list) {
      const words = this.fallback.data.list;
      return this.native.formatToParts(list).map((part) => (part.type === 'literal' && words[part.value] ? { ...part, value: words[part.value] } : part));
    }

    format(list) {
      return this.formatToParts(list)
        .map((part) => part.value)
        .join('');
    }

    resolvedOptions() {
      return { ...this.native.resolvedOptions(), locale: this.fallback.tag };
    }
  };
}

function wrap(Native, Fallback) {
  function Wrapped(locales, options) {
    const fallback = fallbackFor(Native, locales);
    return fallback ? new Fallback(fallback, options) : new Native(locales, options);
  }
  Wrapped.prototype = Native.prototype;
  Wrapped.supportedLocalesOf = Native.supportedLocalesOf.bind(Native);
  Object.defineProperty(Wrapped, 'name', { value: Native.name });
  return Wrapped;
}

const missing = (Native) => {
  try {
    return Object.keys(FALLBACKS).some((lang) => !Native.supportedLocalesOf([lang]).length);
  } catch {
    return false;
  }
};

function dateDefaults(options, required, defaults) {
  const o = options || {};
  if (o.dateStyle || o.timeStyle) return o;
  return required.some((key) => o[key] !== undefined) ? o : { ...o, ...defaults };
}

/** Wraps the Intl constructors (and toLocale*String) the browser lacks data for. Idempotent. */
export function installIntlFallbacks(g = globalThis) {
  const Intl = g.Intl;
  if (!Intl || Intl.__portalFallbacks) return false;
  const NativeDTF = Intl.DateTimeFormat;
  const NativeNF = Intl.NumberFormat;
  let installed = false;

  if (missing(NativeNF)) {
    const NF = makeNumberFormat(NativeNF);
    Intl.NumberFormat = wrap(NativeNF, NF);
    const toLocaleString = g.Number.prototype.toLocaleString;
    g.Number.prototype.toLocaleString = function (locales, options) {
      const fallback = fallbackFor(NativeNF, locales);
      return fallback ? new NF(fallback, options).format(Number(this)) : toLocaleString.call(this, locales, options);
    };
    installed = true;
  }
  if (missing(NativeDTF)) {
    const DTF = makeDateTimeFormat(NativeDTF);
    Intl.DateTimeFormat = wrap(NativeDTF, DTF);
    const proto = g.Date.prototype;
    const patch = (method, required, defaults) => {
      const native = proto[method];
      proto[method] = function (locales, options) {
        const fallback = fallbackFor(NativeDTF, locales);
        if (!fallback) return native.call(this, locales, options);
        if (Number.isNaN(this.getTime())) return 'Invalid Date';
        return new DTF(fallback, dateDefaults(options, required, defaults)).format(this);
      };
    };
    const D = { year: 'numeric', month: 'numeric', day: 'numeric' };
    const T = { hour: 'numeric', minute: 'numeric', second: 'numeric' };
    patch('toLocaleDateString', ['weekday', 'year', 'month', 'day'], D);
    patch('toLocaleTimeString', ['dayPeriod', 'hour', 'minute', 'second', 'fractionalSecondDigits'], T);
    patch('toLocaleString', [...DATE_FIELDS, ...TIME_FIELDS], { ...D, ...T });
    installed = true;
  }
  if (Intl.RelativeTimeFormat && missing(Intl.RelativeTimeFormat)) {
    Intl.RelativeTimeFormat = wrap(Intl.RelativeTimeFormat, makeRelativeTimeFormat(NativeNF));
    installed = true;
  }
  if (Intl.ListFormat && missing(Intl.ListFormat)) {
    Intl.ListFormat = wrap(Intl.ListFormat, makeListFormat(Intl.ListFormat));
    installed = true;
  }
  Object.defineProperty(Intl, '__portalFallbacks', { value: installed });
  return installed;
}
