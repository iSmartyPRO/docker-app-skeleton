export const TYPOGRAPHY_PRESETS = [
  {
    id: 'manrope',
    name: { en: 'Manrope Variable', ru: 'Manrope' },
    summary: {
      en: 'Single variable grotesque, 200–800. Latin and Cyrillic subsets, no second typeface.',
      ky: 'Бир вариативдүү гротеск, 200–800. Латын жана кирилл тамгалары, экинчи шрифтсиз.',
      tr: 'Tek değişken grotesk, 200–800. Latin ve Kiril alt kümeleri, ikinci yazı tipi yok.',
      zh: '单一可变无衬线字体，字重 200–800。含拉丁和西里尔字符，无第二字体。',
      ru: 'Один вариативный гротеск 200–800. Латиница и кириллица, без второй гарнитуры.',
    },
    body: 'Manrope',
    heading: 'Manrope',
    fallback: "'Segoe UI', 'Helvetica Neue', Arial, sans-serif",
    google: ['Manrope:wght@200..800'],
    baseFontSize: 16,
    headingWeight: 700,
    bodyWeight: 400,
  },
  {
    id: 'gosuslugi',
    name: { en: 'Gosuslugi Lato', ru: 'Госуслуги · Lato' },
    summary: {
      en: 'One humanist grotesque. 400/700 only, modular 16→24→32, no tracking, no caps.',
      ky: 'Бир гуманисттик гротеск. 400/700 гана, 16→24→32 шкала, трекингсиз жана баш тамгасыз.',
      tr: 'Tek hümanist grotesk. Yalnızca 400/700, 16→24→32 ölçeği, harf aralığı ve büyük harf yok.',
      zh: '单一人文主义无衬线字体。仅 400/700 字重，16→24→32 字号阶梯，无字距调整和全大写。',
      ru: 'Один гуманистический гротеск. Только 400/700, шкала 16→24→32, без трекинга и капса.',
    },
    body: 'Lato',
    heading: 'Lato',
    fallback: "Arial, 'Helvetica Neue', sans-serif",
    google: ['Lato:wght@400;700'],
    baseFontSize: 16,
    headingWeight: 700,
    bodyWeight: 400,
  },
  {
    id: 'google',
    name: { en: 'Google Material', ru: 'Google Material' },
    summary: {
      en: 'Roboto as the UI workhorse, Google Sans in the stack, Arial for speed fallback.',
      ky: 'Интерфейс үчүн Roboto, стекте Google Sans, ыкчам запас катары Arial.',
      tr: 'Arayüz için Roboto, yığında Google Sans, hızlı yedek olarak Arial.',
      zh: '界面使用 Roboto，字体栈中含 Google Sans，Arial 作为快速后备。',
      ru: 'Roboto для интерфейса, Google Sans в стеке, Arial как быстрый fallback.',
    },
    body: 'Roboto',
    heading: 'Roboto',
    fallback: "'Google Sans', Arial, sans-serif",
    google: ['Roboto:wght@400;500;700'],
    baseFontSize: 16,
    headingWeight: 500,
    bodyWeight: 400,
  },
  {
    id: 'google-product',
    name: { en: 'Google Product', ru: 'Google Product' },
    summary: {
      en: 'Geometric Onest for brand lines, Roboto for interface — Product Sans character with Cyrillic.',
      ky: 'Бренд үчүн геометриялык Onest, интерфейс үчүн Roboto — кирилл тамгалуу Product Sans мүнөзү.',
      tr: 'Marka için geometrik Onest, arayüz için Roboto — Kiril destekli Product Sans karakteri.',
      zh: '品牌文字使用几何风格的 Onest，界面使用 Roboto——带西里尔字符的 Product Sans 风格。',
      ru: 'Геометрический Onest для бренда, Roboto для интерфейса — характер Product Sans с кириллицей.',
    },
    body: 'Roboto',
    heading: 'Onest',
    fallback: 'Arial, sans-serif',
    google: ['Onest:wght@400;500;700', 'Roboto:wght@400;500;700'],
    baseFontSize: 16,
    headingWeight: 600,
    bodyWeight: 400,
  },
  {
    id: 'ibm-carbon',
    name: { en: 'IBM Carbon', ru: 'IBM Carbon' },
    summary: {
      en: 'IBM Plex Sans — engineered corporate voice of Carbon Design System.',
      ky: 'IBM Plex Sans — Carbon Design System\'дин инженердик корпоративдик үнү.',
      tr: 'IBM Plex Sans — Carbon Design System\'in mühendislik odaklı kurumsal sesi.',
      zh: 'IBM Plex Sans——Carbon Design System 严谨的企业风格。',
      ru: 'IBM Plex Sans — инженерный корпоративный голос Carbon Design System.',
    },
    body: 'IBM Plex Sans',
    heading: 'IBM Plex Sans',
    fallback: "'Helvetica Neue', Arial, sans-serif",
    google: ['IBM Plex Sans:wght@400;500;600;700'],
    baseFontSize: 16,
    headingWeight: 600,
    bodyWeight: 400,
  },
  {
    id: 'inter',
    name: { en: 'Inter Corporate', ru: 'Inter' },
    summary: {
      en: 'The default of modern SaaS. Screen-first metrics, excellent at small UI sizes.',
      ky: 'Заманбап SaaS\'тын иш жүзүндөгү стандарты. Экран үчүн метрикалар, UI\'да жакшы окулат.',
      tr: 'Modern SaaS\'ın fiilî standardı. Ekran odaklı ölçüler, küçük arayüz boyutlarında mükemmel.',
      zh: '现代 SaaS 的事实标准。为屏幕设计，小字号界面中依然清晰。',
      ru: 'Де-факто стандарт современного SaaS. Экранные метрики, отлично читается в UI.',
    },
    body: 'Inter',
    heading: 'Inter',
    fallback: "system-ui, 'Segoe UI', sans-serif",
    google: ['Inter:wght@400;500;600;700'],
    baseFontSize: 15,
    headingWeight: 600,
    bodyWeight: 400,
  },
  {
    id: 'source-sans',
    name: { en: 'Adobe Source Sans', ru: 'Adobe Source Sans' },
    summary: {
      en: 'Source Sans 3 — Adobe’s open corporate grotesque, calm and multilingual.',
      ky: 'Source Sans 3 — Adobe\'нун ачык корпоративдик гротески, сабырдуу жана көп тилдүү.',
      tr: 'Source Sans 3 — Adobe\'un açık kurumsal groteski; sakin ve çok dilli.',
      zh: 'Source Sans 3——Adobe 的开源企业无衬线字体，沉稳且支持多语言。',
      ru: 'Source Sans 3 — открытый корпоративный гротеск Adobe, спокойный и многоязычный.',
    },
    body: 'Source Sans 3',
    heading: 'Source Sans 3',
    fallback: "Arial, 'Segoe UI', sans-serif",
    google: ['Source Sans 3:wght@400;500;600;700'],
    baseFontSize: 16,
    headingWeight: 600,
    bodyWeight: 400,
  },
  {
    id: 'noto',
    name: { en: 'Noto Sans World', ru: 'Noto Sans' },
    summary: {
      en: 'Google’s universal grotesque. Designed so no language looks like a fallback.',
      ky: 'Google\'дун универсалдуу гротески. Бир да тил запастагыдай көрүнбөйт.',
      tr: 'Google\'ın evrensel groteski. Hiçbir dil yedek yazı tipiyle yazılmış gibi görünmez.',
      zh: 'Google 的通用无衬线字体。任何语言都不会显得像后备字体。',
      ru: 'Универсальный гротеск Google. Ни один язык не выглядит как запасной.',
    },
    body: 'Noto Sans',
    heading: 'Noto Sans',
    fallback: "Arial, 'Segoe UI', sans-serif",
    google: ['Noto Sans:wght@400;500;600;700'],
    baseFontSize: 16,
    headingWeight: 600,
    bodyWeight: 400,
  },
  {
    id: 'golos',
    name: { en: 'Golos Text', ru: 'Golos Text' },
    summary: {
      en: 'Paratype’s digital Russian grotesque — the voice of contemporary .ru products.',
      ky: 'Paratype\'тын санариптик орус гротески — заманбап .ru продуктуларынын үнү.',
      tr: 'Paratype\'ın dijital Rus groteski — günümüz .ru ürünlerinin sesi.',
      zh: 'Paratype 的数字化俄文无衬线字体——当代 .ru 产品的风格。',
      ru: 'Цифровой русский гротеск Paratype — голос современных .ru-продуктов.',
    },
    body: 'Golos Text',
    heading: 'Golos Text',
    fallback: "'PT Sans', Arial, sans-serif",
    google: ['Golos Text:wght@400;500;600;700'],
    baseFontSize: 16,
    headingWeight: 600,
    bodyWeight: 400,
  },
  {
    id: 'pt-sans',
    name: { en: 'PT Sans', ru: 'PT Sans' },
    summary: {
      en: 'The classic public-domain Russian grotesque. Neutral, institutional, trusted.',
      ky: 'Классикалык жалпыга жеткиликтүү орус гротески. Нейтралдуу жана расмий.',
      tr: 'Klasik, herkese açık Rus groteski. Nötr, kurumsal ve güvenilir.',
      zh: '经典的公共俄文无衬线字体。中性、正式、可靠。',
      ru: 'Классический общедоступный русский гротеск. Нейтральный и институциональный.',
    },
    body: 'PT Sans',
    heading: 'PT Sans',
    fallback: 'Arial, sans-serif',
    google: ['PT Sans:wght@400;700'],
    baseFontSize: 16,
    headingWeight: 700,
    bodyWeight: 400,
  },
  {
    id: 'fira',
    name: { en: 'Fira Sans', ru: 'Fira Sans' },
    summary: {
      en: 'Mozilla’s humanist grotesque. Open, civic, excellent in long UI copy.',
      ky: 'Mozilla\'нын гуманисттик гротески. Ачык, жарандык, узун тексттерде ыңгайлуу.',
      tr: 'Mozilla\'nın hümanist groteski. Açık, kamusal, uzun arayüz metinlerinde mükemmel.',
      zh: 'Mozilla 的人文主义无衬线字体。开放、亲民，适合较长的界面文字。',
      ru: 'Гуманистический гротеск Mozilla. Открытый, гражданский, удобен в длинных текстах.',
    },
    body: 'Fira Sans',
    heading: 'Fira Sans',
    fallback: "'Helvetica Neue', Arial, sans-serif",
    google: ['Fira Sans:wght@400;500;600;700'],
    baseFontSize: 16,
    headingWeight: 600,
    bodyWeight: 400,
  },
  {
    id: 'open-sans',
    name: { en: 'Open Sans', ru: 'Open Sans' },
    summary: {
      en: 'The most deployed humanist web font. Safe, familiar, quietly professional.',
      ky: 'Эң кеңири таралган гуманисттик веб-шрифт. Коопсуз жана токтоо иштиктүү.',
      tr: 'En yaygın hümanist web yazı tipi. Güvenli, tanıdık, sakin ve profesyonel.',
      zh: '使用最广泛的人文主义网页字体。稳妥、熟悉、低调专业。',
      ru: 'Самый распространённый гуманистический веб-шрифт. Безопасный и спокойно-деловой.',
    },
    body: 'Open Sans',
    heading: 'Open Sans',
    fallback: "Arial, 'Helvetica Neue', sans-serif",
    google: ['Open Sans:wght@400;500;600;700'],
    baseFontSize: 16,
    headingWeight: 600,
    bodyWeight: 400,
  },
  {
    id: 'montserrat',
    name: { en: 'Montserrat Brand', ru: 'Montserrat' },
    summary: {
      en: 'Urban geometric with poster confidence. Strong for brand sites and campaigns.',
      ky: 'Шаардык геометриялык гротеск. Бренд сайттарында жана кампанияларда күчтүү.',
      tr: 'Afiş özgüvenine sahip kentsel geometrik. Marka siteleri ve kampanyalarda güçlü.',
      zh: '具有海报气质的都市几何字体。适合品牌网站和营销活动。',
      ru: 'Городской геометрический гротеск. Силён на бренд-сайтах и кампаниях.',
    },
    body: 'Montserrat',
    heading: 'Montserrat',
    fallback: "'Helvetica Neue', Arial, sans-serif",
    google: ['Montserrat:wght@400;500;600;700'],
    baseFontSize: 15,
    headingWeight: 700,
    bodyWeight: 400,
  },
  {
    id: 'nunito',
    name: { en: 'Nunito Soft', ru: 'Nunito Sans' },
    summary: {
      en: 'Rounded terminals, approachable corporate. Used by education and fintech onboarding.',
      ky: 'Тегеректелген учтар, жылуу корпоративдик стиль. Билим берүү жана финтех онбординги.',
      tr: 'Yuvarlatılmış uçlar, samimi kurumsal görünüm. Eğitim ve fintek kayıt akışlarında kullanılır.',
      zh: '圆润的笔画末端，亲和的企业风格。常用于教育和金融科技的入门引导。',
      ru: 'Скруглённые терминалы, дружелюбный корпоратив. Образование и финтех-онбординг.',
    },
    body: 'Nunito Sans',
    heading: 'Nunito Sans',
    fallback: "Arial, 'Segoe UI', sans-serif",
    google: ['Nunito Sans:wght@400;500;600;700'],
    baseFontSize: 16,
    headingWeight: 700,
    bodyWeight: 400,
  },
  {
    id: 'mulish',
    name: { en: 'Mulish', ru: 'Mulish' },
    summary: {
      en: 'A quieter Avenir cousin. Balanced for dashboards that must stay warm.',
      ky: 'Avenir\'дин тынчыраак тууганы. Жылуу дашборддор үчүн тең салмак.',
      tr: 'Avenir\'in daha sakin bir akrabası. Sıcak kalması gereken panolar için dengeli.',
      zh: 'Avenir 的低调近亲。适合需要保持温暖感的仪表板。',
      ru: 'Более тихий родственник Avenir. Баланс для тёплых дашбордов.',
    },
    body: 'Mulish',
    heading: 'Mulish',
    fallback: "'Segoe UI', Arial, sans-serif",
    google: ['Mulish:wght@400;500;600;700'],
    baseFontSize: 16,
    headingWeight: 700,
    bodyWeight: 400,
  },
  {
    id: 'raleway',
    name: { en: 'Raleway Light', ru: 'Raleway' },
    summary: {
      en: 'Elegant wide grotesque. Headlines feel designed; body stays restrained.',
      ky: 'Көрктүү кең гротеск. Аталыштар «жасалгаланган» көрүнөт, текст токтоо.',
      tr: 'Zarif, geniş grotesk. Başlıklar tasarlanmış görünür, gövde metni ölçülü kalır.',
      zh: '优雅的宽体无衬线字体。标题富有设计感，正文克制。',
      ru: 'Элегантный широкий гротеск. Заголовки выглядят «сделанными», текст сдержан.',
    },
    body: 'Raleway',
    heading: 'Raleway',
    fallback: "'Helvetica Neue', Arial, sans-serif",
    google: ['Raleway:wght@400;500;600;700'],
    baseFontSize: 16,
    headingWeight: 600,
    bodyWeight: 400,
  },
  {
    id: 'ubuntu',
    name: { en: 'Ubuntu', ru: 'Ubuntu' },
    summary: {
      en: 'Canonical’s humanist. Distinctly open-source, still boardroom-safe.',
      ky: 'Canonical\'дын гуманисттик шрифти. Ачык булактуу экени таанылат, бирок директорлор кеңешинде да орундуу.',
      tr: 'Canonical\'ın hümanist yazı tipi. Belirgin biçimde açık kaynak, yine de yönetim kurulunda uygun.',
      zh: 'Canonical 的人文主义字体。带有鲜明的开源气质，也适合正式场合。',
      ru: 'Гуманистический шрифт Canonical. Узнаваемо open-source, но уместен в совете директоров.',
    },
    body: 'Ubuntu',
    heading: 'Ubuntu',
    fallback: "'Segoe UI', Arial, sans-serif",
    google: ['Ubuntu:wght@400;500;700'],
    baseFontSize: 16,
    headingWeight: 700,
    bodyWeight: 400,
  },
  {
    id: 'rubik',
    name: { en: 'Rubik', ru: 'Rubik' },
    summary: {
      en: 'Slightly rounded geometry. Popular with marketplaces and consumer brands.',
      ky: 'Бир аз тегеректелген геометрия. Маркетплейстер жана керектөө бренддери.',
      tr: 'Hafifçe yuvarlatılmış geometri. Pazaryerleri ve tüketici markalarında popüler.',
      zh: '略带圆角的几何字体。深受电商平台和消费品牌青睐。',
      ru: 'Чуть скруглённая геометрия. Маркетплейсы и потребительские бренды.',
    },
    body: 'Rubik',
    heading: 'Rubik',
    fallback: "Arial, 'Segoe UI', sans-serif",
    google: ['Rubik:wght@400;500;600;700'],
    baseFontSize: 16,
    headingWeight: 600,
    bodyWeight: 400,
  },
  {
    id: 'jost',
    name: { en: 'Jost Geometric', ru: 'Jost' },
    summary: {
      en: 'Bauhaus revival. Architectural, European, precise in large headings.',
      ky: 'Баухаустун кайра жаралышы. Архитектуралык, европалык, ири аталыштарда так.',
      tr: 'Bauhaus canlanışı. Mimari, Avrupai, büyük başlıklarda kesin.',
      zh: '包豪斯复兴风格。建筑感、欧式，大标题中精准有力。',
      ru: 'Возрождение Баухауса. Архитектурный, европейский, точен в крупных заголовках.',
    },
    body: 'Jost',
    heading: 'Jost',
    fallback: "'Futura', Arial, sans-serif",
    google: ['Jost:wght@400;500;600;700'],
    baseFontSize: 16,
    headingWeight: 600,
    bodyWeight: 400,
  },
  {
    id: 'geologica',
    name: { en: 'Geologica', ru: 'Geologica' },
    summary: {
      en: 'Variable geometric with Cyrillic. A credible Google Sans stand-in for CIS brands.',
      ky: 'Кирилл тамгалуу вариативдүү геометрия. КМШ бренддери үчүн Google Sans\'тын татыктуу алмаштыруучусу.',
      tr: 'Kiril destekli değişken geometrik. BDT markaları için güvenilir bir Google Sans alternatifi.',
      zh: '支持西里尔字符的可变几何字体。独联体品牌可靠的 Google Sans 替代品。',
      ru: 'Вариативная геометрия с кириллицей. Достойная замена Google Sans для CIS-брендов.',
    },
    body: 'Geologica',
    heading: 'Geologica',
    fallback: "Arial, 'Segoe UI', sans-serif",
    google: ['Geologica:wght@400..700'],
    baseFontSize: 16,
    headingWeight: 600,
    bodyWeight: 400,
  },
  {
    id: 'commissioner',
    name: { en: 'Commissioner', ru: 'Commissioner' },
    summary: {
      en: 'Low-contrast variable grotesque. Quiet luxury for reports and investor pages.',
      ky: 'Төмөн контрасттуу вариативдүү гротеск. Отчеттор жана инвесторлор барактары үчүн токтоо кооздук.',
      tr: 'Düşük kontrastlı değişken grotesk. Raporlar ve yatırımcı sayfaları için sessiz lüks.',
      zh: '低对比度可变无衬线字体。为报告和投资者页面带来低调的高级感。',
      ru: 'Низкоконтрастный вариативный гротеск. Тихая роскошь для отчётов и investor pages.',
    },
    body: 'Commissioner',
    heading: 'Commissioner',
    fallback: "'Segoe UI', Arial, sans-serif",
    google: ['Commissioner:wght@400..700'],
    baseFontSize: 16,
    headingWeight: 600,
    bodyWeight: 400,
  },
  {
    id: 'source-serif',
    name: { en: 'Source Editorial', ru: 'Source Editorial' },
    summary: {
      en: 'Source Serif 4 headlines, Source Sans 3 body — Adobe’s publishing pair.',
      ky: 'Аталыштарда Source Serif 4, текстте Source Sans 3 — Adobe\'нун басма жуптары.',
      tr: 'Başlıklarda Source Serif 4, gövdede Source Sans 3 — Adobe\'un yayıncılık ikilisi.',
      zh: '标题用 Source Serif 4，正文用 Source Sans 3——Adobe 的出版字体组合。',
      ru: 'Source Serif 4 в заголовках, Source Sans 3 в тексте — издательская пара Adobe.',
    },
    body: 'Source Sans 3',
    heading: 'Source Serif 4',
    fallback: "Georgia, 'Times New Roman', serif",
    google: ['Source Serif 4:wght@500;600;700', 'Source Sans 3:wght@400;600'],
    baseFontSize: 16,
    headingWeight: 600,
    bodyWeight: 400,
  },
  {
    id: 'ibm-editorial',
    name: { en: 'IBM Editorial', ru: 'IBM Editorial' },
    summary: {
      en: 'Plex Serif + Plex Sans. The two-voice system of serious enterprise publishing.',
      ky: 'Plex Serif + Plex Sans. Олуттуу корпоративдик басылманын эки үндүү системасы.',
      tr: 'Plex Serif + Plex Sans. Ciddi kurumsal yayıncılığın iki sesli sistemi.',
      zh: 'Plex Serif + Plex Sans。严肃企业出版的双字体体系。',
      ru: 'Plex Serif + Plex Sans. Двухголосая система серьёзного enterprise-издания.',
    },
    body: 'IBM Plex Sans',
    heading: 'IBM Plex Serif',
    fallback: "Georgia, 'Times New Roman', serif",
    google: ['IBM Plex Serif:wght@500;600;700', 'IBM Plex Sans:wght@400;500;600'],
    baseFontSize: 16,
    headingWeight: 600,
    bodyWeight: 400,
  },
  {
    id: 'literata',
    name: { en: 'Literata Press', ru: 'Literata' },
    summary: {
      en: 'Google Play Books’ reading face with Source Sans. Long-form authority.',
      ky: 'Google Play Books\'тун окуу шрифти жана Source Sans. Узун тексттин кадыры.',
      tr: 'Source Sans ile Google Play Books\'un okuma yazı tipi. Uzun metinlerde otorite.',
      zh: 'Google Play 图书的阅读字体搭配 Source Sans。长文阅读的权威之选。',
      ru: 'Читальная гарнитура Google Play Books плюс Source Sans. Авторитет длинного текста.',
    },
    body: 'Source Sans 3',
    heading: 'Literata',
    fallback: "Georgia, 'Times New Roman', serif",
    google: ['Literata:wght@500;600;700', 'Source Sans 3:wght@400;600'],
    baseFontSize: 17,
    headingWeight: 600,
    bodyWeight: 400,
  },
  {
    id: 'cormorant',
    name: { en: 'Cormorant Atelier', ru: 'Cormorant' },
    summary: {
      en: 'Display Garamond with Manrope. Heritage luxury, still usable in a product UI.',
      ky: 'Manrope менен акциденттик Гарамон. Продуктта да орундуу мурастык кооздук.',
      tr: 'Manrope ile gösterişli Garamond. Ürün arayüzünde de kullanılabilen klasik lüks.',
      zh: '展示型 Garamond 搭配 Manrope。传承的高级感，同样适用于产品界面。',
      ru: 'Акцидентный гарамон с Manrope. Наследственная роскошь, уместная в продукте.',
    },
    body: 'Manrope',
    heading: 'Cormorant Garamond',
    fallback: "Georgia, 'Times New Roman', serif",
    google: ['Cormorant Garamond:wght@600;700', 'Manrope:wght@400;500;600'],
    baseFontSize: 16,
    headingWeight: 600,
    bodyWeight: 400,
  },
  {
    id: 'playfair',
    name: { en: 'Playfair Press', ru: 'Playfair' },
    summary: {
      en: 'High-contrast Didone headlines, Source Sans body. Fashion, culture, annual reports.',
      ky: 'Жогорку контрасттуу дидон аталыштары, текстте Source Sans. Мода, маданият, жылдык отчеттор.',
      tr: 'Yüksek kontrastlı Didone başlıklar, gövdede Source Sans. Moda, kültür, yıllık raporlar.',
      zh: '高对比度 Didone 风格标题，正文用 Source Sans。适合时尚、文化和年度报告。',
      ru: 'Высококонтрастные дидоновские заголовки, Source Sans в тексте. Мода, культура, годовые отчёты.',
    },
    body: 'Source Sans 3',
    heading: 'Playfair Display',
    fallback: "Georgia, 'Times New Roman', serif",
    google: ['Playfair Display:wght@600;700', 'Source Sans 3:wght@400;600'],
    baseFontSize: 16,
    headingWeight: 700,
    bodyWeight: 400,
  },
  {
    id: 'spectral',
    name: { en: 'Spectral Ledger', ru: 'Spectral' },
    summary: {
      en: 'News-grade serif with IBM Plex Sans. Banks, ministries, research institutes.',
      ky: 'IBM Plex Sans менен гезиттик антиква. Банктар, мекемелер, изилдөө институттары.',
      tr: 'IBM Plex Sans ile gazete kalitesinde serif. Bankalar, bakanlıklar, araştırma enstitüleri.',
      zh: '新闻级衬线字体搭配 IBM Plex Sans。适合银行、政府部门和研究机构。',
      ru: 'Газетная антиква с IBM Plex Sans. Банки, ведомства, исследовательские институты.',
    },
    body: 'IBM Plex Sans',
    heading: 'Spectral',
    fallback: "Georgia, 'Times New Roman', serif",
    google: ['Spectral:wght@500;600;700', 'IBM Plex Sans:wght@400;500;600'],
    baseFontSize: 16,
    headingWeight: 600,
    bodyWeight: 400,
  },
  {
    id: 'merriweather',
    name: { en: 'Merriweather News', ru: 'Merriweather' },
    summary: {
      en: 'Screen serif designed for readability, paired with Source Sans.',
      ky: 'Окууга ыңгайлуу экрандык антиква, Source Sans менен жупта.',
      tr: 'Okunabilirlik için tasarlanmış ekran serif\'i, Source Sans ile eşleştirilmiş.',
      zh: '为易读性设计的屏幕衬线字体，搭配 Source Sans。',
      ru: 'Экранная антиква для чтения в паре с Source Sans.',
    },
    body: 'Source Sans 3',
    heading: 'Merriweather',
    fallback: "Georgia, 'Times New Roman', serif",
    google: ['Merriweather:wght@700', 'Source Sans 3:wght@400;600'],
    baseFontSize: 16,
    headingWeight: 700,
    bodyWeight: 400,
  },
];

export const FONT_OPTIONS = TYPOGRAPHY_PRESETS.map((item) => ({
  id: item.id,
  label: item.name.en,
}));

const LEGACY_FONT_TO_PRESET = {
  Manrope: 'manrope',
  Sora: 'manrope',
  'IBM Plex Sans': 'ibm-carbon',
  'Source Serif 4': 'source-serif',
  'Cormorant Garamond': 'cormorant',
};

export function getTypographyPreset(id) {
  return TYPOGRAPHY_PRESETS.find((item) => item.id === id) || TYPOGRAPHY_PRESETS[0];
}

export function resolveTypography(appearance = {}) {
  const stored = appearance.typography || {};
  const presetId =
    stored.preset || LEGACY_FONT_TO_PRESET[stored.fontFamily] || 'manrope';
  const preset = getTypographyPreset(presetId);
  return {
    ...preset,
    preset: preset.id,
    baseFontSize: Number(stored.baseFontSize) || preset.baseFontSize,
    headingWeight: Number(stored.headingWeight) || preset.headingWeight,
  };
}

/*
 * Every stack ends with fonts for the scripts the portal's languages need
 * beyond Latin and Russian Cyrillic: Kyrgyz ң ө ү (Cyrillic Extended — Google
 * Fonts serves its cyrillic-ext subset when the family has one, else these
 * system fonts draw the letters) and Simplified Chinese (CJK system fonts of
 * macOS/iOS, Windows, Android/Linux). Glyphs fall through one by one, so
 * Latin text keeps the preset's typeface.
 */
const SANS_SCRIPTS = ["'Noto Sans'", "'PingFang SC'", "'Hiragino Sans GB'", "'Microsoft YaHei'", "'Noto Sans SC'", "'Noto Sans CJK SC'", "'Source Han Sans SC'"];
const SERIF_SCRIPTS = ["'Noto Serif'", "'Songti SC'", "'Noto Serif SC'", "'Noto Serif CJK SC'", "'Source Han Serif SC'", 'SimSun'];
const GENERIC = ['sans-serif', 'serif', 'monospace', 'system-ui', 'cursive'];

export function withScriptFallbacks(fallback) {
  const parts = String(fallback || '').split(',').map((part) => part.trim()).filter(Boolean);
  const generic = GENERIC.includes(parts[parts.length - 1]) ? parts.pop() : 'sans-serif';
  const extra = (generic === 'serif' ? SERIF_SCRIPTS : SANS_SCRIPTS).filter((font) => !parts.includes(font));
  return [...parts, ...extra, generic].join(', ');
}

export function fontStack(typo) {
  return `'${typo.body}', ${withScriptFallbacks(typo.fallback)}`;
}

export function headingStack(typo) {
  return `'${typo.heading}', ${withScriptFallbacks(typo.fallback)}`;
}

export function googleFontsHref(presets) {
  const families = new Map();
  for (const preset of presets.filter(Boolean)) {
    for (const spec of preset.google || []) {
      const colon = spec.indexOf(':');
      const name = colon === -1 ? spec : spec.slice(0, colon);
      const axis = colon === -1 ? 'wght@400;600;700' : spec.slice(colon + 1);
      families.set(name, axis);
    }
  }
  if (!families.size) return '';
  const query = [...families]
    .map(([name, axis]) => `family=${encodeURIComponent(name).replace(/%20/g, '+')}:${axis}`)
    .join('&');
  return `https://fonts.googleapis.com/css2?${query}&display=swap`;
}
