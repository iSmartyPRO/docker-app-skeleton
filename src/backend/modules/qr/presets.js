import { cleanDesign } from './design.js';

/*
 * Ready-made templates, seeded once into qr_templates (and restored by
 * «Вернуть стандартные шаблоны»). Two follow the portal brand: "@brand" is
 * the theme's primary colour and logo "brand" the logo from Settings →
 * Appearance, so a superadministrator only has to switch them on.
 * An empty caption means «Сканируйте меня» in the viewer's language.
 */

const T = (ru, en, ky, tr, zh) => ({ ru, en, ky, tr, zh });

function texts(names, descriptions) {
  const out = {};
  for (const lang of Object.keys(names)) out[lang] = { name: names[lang], description: descriptions[lang] };
  return out;
}

export const PRESETS = [
  {
    key: 'brand',
    names: T('Фирменный', 'Brand', 'Фирмалык', 'Kurumsal', '品牌'),
    descriptions: T(
      'Цвет и логотип компании. Пользователи не меняют цвета и логотип.',
      'Company colour and logo. People cannot change the colours or the logo.',
      'Компаниянын түсү жана логотиби. Колдонуучулар түстөрдү жана логотипти өзгөртө алышпайт.',
      'Şirket rengi ve logosu. Kullanıcılar renkleri ve logoyu değiştiremez.',
      '公司品牌色和标志。用户不能更改颜色和标志。'
    ),
    isDefault: true,
    locks: { colors: true, logo: true },
    design: {
      dots: { style: 'rounded', color: '@brand' },
      eyes: { frame: 'rounded', ball: 'rounded' },
      logo: { source: 'brand', size: 22, plate: 'rounded', plateColor: '#FFFFFF', padding: 12 },
    },
  },
  {
    key: 'brand-card',
    names: T('Фирменная карточка', 'Brand card', 'Фирмалык карточка', 'Kurumsal kart', '品牌卡片'),
    descriptions: T(
      'Логотип, плавные точки и подпись в рамке фирменного цвета — для печати и стендов.',
      'Logo, fluid dots and a caption in a brand-coloured frame — for print and stands.',
      'Логотип, жылмакай чекиттер жана фирмалык түстөгү алкакта жазуу — басып чыгаруу үчүн.',
      'Logo, akışkan noktalar ve kurumsal renkli çerçevede yazı — baskı ve standlar için.',
      '标志、流线点阵和品牌色边框中的说明文字——适合印刷和展台。'
    ),
    design: {
      dots: { style: 'fluid', color: '@brand' },
      eyes: { frame: 'soft', ball: 'rounded' },
      logo: { source: 'brand', size: 20, plate: 'rounded', plateColor: '#FFFFFF', padding: 12 },
      frame: { style: 'card', color: '@brand', textColor: '#FFFFFF' },
    },
  },
  {
    key: 'classic',
    names: T('Классический', 'Classic', 'Классикалык', 'Klasik', '经典'),
    descriptions: T(
      'Чёрные квадраты на белом. Читается любой камерой и любым сканером.',
      'Black squares on white. Every camera and scanner reads it.',
      'Актта кара чарчылар. Ар кандай камера окуйт.',
      'Beyaz üzerine siyah kareler. Her kamera ve tarayıcı okur.',
      '白底黑方块，任何相机和扫码器都能识别。'
    ),
    design: {
      dots: { style: 'square', color: '#000000' },
      eyes: { frame: 'square', ball: 'square' },
      margin: 4,
      ecl: 'M',
    },
  },
  {
    key: 'graphite',
    names: T('Графит', 'Graphite', 'Графит', 'Grafit', '石墨'),
    descriptions: T(
      'Круглые точки и глазки графитового цвета. Спокойно и современно.',
      'Round dots and eyes in graphite. Calm and modern.',
      'Графит түстөгү тегерек чекиттер. Тынч жана заманбап.',
      'Grafit renginde yuvarlak noktalar. Sakin ve modern.',
      '石墨色圆点与定位点，沉稳而现代。'
    ),
    design: {
      dots: { style: 'dots', color: '#1F2937' },
      eyes: { frame: 'circle', ball: 'circle' },
    },
  },
  {
    key: 'ocean',
    names: T('Океан', 'Ocean', 'Океан', 'Okyanus', '海洋'),
    descriptions: T(
      'Градиент от синего к бирюзовому, глазки-лепестки, подпись под кодом.',
      'A blue-to-teal gradient, leaf eyes and a caption below.',
      'Көктөн бирюзага градиент, жалбырак көздөр, астында жазуу.',
      'Maviden turkuaza geçiş, yaprak gözler ve altında yazı.',
      '蓝到青的渐变、叶形定位点，下方配说明。'
    ),
    design: {
      dots: { style: 'rounded', color: '#1D4ED8', gradient: { type: 'linear', from: '#1D4ED8', to: '#0E7490', angle: 135 } },
      eyes: { frame: 'leaf', ball: 'leaf', frameColor: '#1E3A8A', ballColor: '#0E7490' },
      frame: { style: 'caption', color: '#1E3A8A', textColor: '#1E3A8A' },
    },
  },
  {
    key: 'sunset',
    names: T('Закат', 'Sunset', 'Күн батуу', 'Gün batımı', '日落'),
    descriptions: T(
      'Тёплый градиент от малинового к оранжевому — для акций и мероприятий.',
      'A warm raspberry-to-orange gradient — for promotions and events.',
      'Малинадан кызгылт сарыга жылуу градиент — акциялар үчүн.',
      'Ahudududan turuncuya sıcak geçiş — kampanyalar ve etkinlikler için.',
      '从玫红到橙色的暖色渐变——适合促销和活动。'
    ),
    design: {
      dots: { style: 'classy', color: '#BE185D', gradient: { type: 'radial', from: '#BE185D', to: '#EA580C', angle: 0 } },
      eyes: { frame: 'soft', ball: 'rounded', frameColor: '#9D174D', ballColor: '#EA580C' },
      frame: { style: 'badge', color: '#BE185D', textColor: '#FFFFFF' },
    },
  },
  {
    key: 'emerald',
    names: T('Изумруд', 'Emerald', 'Зымырыт', 'Zümrüt', '翡翠'),
    descriptions: T(
      'Глубокий зелёный, элегантные точки и билет с подписью сверху.',
      'Deep green, elegant dots and a ticket with the caption on top.',
      'Терең жашыл, жарашыктуу чекиттер жана үстүндө жазуусу бар билет.',
      'Koyu yeşil, zarif noktalar ve üstte yazılı bir bilet.',
      '深绿色、优雅点阵，顶部为票据式说明。'
    ),
    design: {
      dots: { style: 'classy', color: '#065F46' },
      eyes: { frame: 'leaf', ball: 'leaf', frameColor: '#047857', ballColor: '#065F46' },
      frame: { style: 'ticket', color: '#065F46', textColor: '#ECFDF5' },
    },
  },
  {
    key: 'midnight',
    names: T('Полночь и золото', 'Midnight and gold', 'Түн жана алтын', 'Gece ve altın', '午夜金'),
    descriptions: T(
      'Тёмно-синие точки, золотые глазки и кремовый фон. Для визиток и приглашений.',
      'Midnight-blue dots, golden eyes and a cream background. For cards and invitations.',
      'Кочкул көк чекиттер, алтын көздөр жана каймак түстүү фон.',
      'Gece mavisi noktalar, altın gözler ve krem zemin. Kartvizit ve davetiyeler için.',
      '午夜蓝点阵、金色定位点、奶油色背景，适合名片和请柬。'
    ),
    design: {
      dots: { style: 'rounded', color: '#0B1F3A' },
      eyes: { frame: 'rounded', ball: 'circle', frameColor: '#A47A1E', ballColor: '#0B1F3A' },
      background: { color: '#FBF7EE', radius: 6 },
      frame: { style: 'card', color: '#0B1F3A', textColor: '#F2D48A' },
    },
  },
  {
    key: 'amethyst',
    names: T('Аметист', 'Amethyst', 'Аметист', 'Ametist', '紫水晶'),
    descriptions: T(
      'Фиолетово-розовый градиент и круглые глазки — ярко, но читаемо.',
      'A violet-to-pink gradient with round eyes — bright yet easy to scan.',
      'Кызгылт көк-кызгылт градиент жана тегерек көздөр.',
      'Mordan pembeye geçiş ve yuvarlak gözler — canlı ama kolay okunur.',
      '紫到粉的渐变与圆形定位点——鲜艳而易于识别。'
    ),
    design: {
      dots: { style: 'dots', color: '#6D28D9', gradient: { type: 'linear', from: '#6D28D9', to: '#DB2777', angle: 45 } },
      eyes: { frame: 'circle', ball: 'circle', frameColor: '#5B21B6', ballColor: '#BE185D' },
      frame: { style: 'caption', color: '#5B21B6', textColor: '#5B21B6' },
    },
  },
];

/** Rows ready for qr_templates, in display order. */
export function presetRows() {
  return PRESETS.map((preset, index) => ({
    key: preset.key,
    name: preset.names.en,
    description: preset.descriptions.en,
    i18n: texts(preset.names, preset.descriptions),
    design: cleanDesign(preset.design),
    locks: { colors: false, shape: false, logo: false, frame: false, ...(preset.locks || {}) },
    isDefault: Boolean(preset.isDefault),
    sort: index,
  }));
}
