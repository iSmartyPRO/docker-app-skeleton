/*
 * antd has no Kyrgyz locale. This one keeps antd's English component texts
 * (pagination, table filters, empty states…) and switches the date pickers
 * to Kyrgyz month and day names (dayjs/locale/ky). Translators: put Kyrgyz
 * texts into OVERRIDES — same shape as antd/es/locale/en_GB.
 */
import enGB from 'antd/es/locale/en_GB';

const OVERRIDES = {};

const withLang = (picker) => (picker ? { ...picker, lang: { ...picker.lang, locale: 'ky' } } : picker);

export default {
  ...enGB,
  ...OVERRIDES,
  locale: 'ky',
  DatePicker: withLang(enGB.DatePicker),
  Calendar: withLang(enGB.Calendar),
};
