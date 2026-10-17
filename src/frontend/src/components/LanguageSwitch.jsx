import { Dropdown, Tooltip } from 'antd';
import { GlobalOutlined } from '@ant-design/icons';
import { useLocale } from '../context/LocaleContext';

/*
 * Interface language switcher: only the languages the superadministrator
 * enabled (Settings → Languages), in their order, by native name. Languages
 * are not countries, so no flags. Up to three languages are pills (EN · RU),
 * more open a menu.
 */

const mark = (code) => code.toUpperCase();

/** Menu items for the enabled languages (also used by the header's mobile menu). */
export function languageItems(languages, locale, prefix = '') {
  return languages.map((language) => ({
    key: `${prefix}${language.code}`,
    label: (
      <span lang={language.tag} className="lang-switch__item">
        {language.name}
      </span>
    ),
    disabled: language.code === locale,
  }));
}

export default function LanguageSwitch() {
  const { locale, languages, setLocale, t } = useLocale();
  if (languages.length < 2) return null;
  const current = languages.find((language) => language.code === locale);

  if (languages.length > 3) {
    return (
      <Dropdown
        trigger={['click']}
        menu={{ items: languageItems(languages, locale), selectable: true, selectedKeys: [locale], onClick: ({ key }) => setLocale(key) }}
      >
        <button type="button" className="lang-switch lang-switch--menu" aria-label={`${t('header.language')}: ${current?.name || locale}`}>
          <GlobalOutlined aria-hidden="true" />
          <span className="lang-switch__mark">{mark(locale)}</span>
        </button>
      </Dropdown>
    );
  }

  return (
    <div className="lang-switch" role="group" aria-label={t('header.language')}>
      {languages.map((language) => (
        <Tooltip key={language.code} title={<span lang={language.tag}>{language.name}</span>} mouseEnterDelay={0.15}>
          <button
            type="button"
            lang={language.tag}
            className={`lang-switch__btn ${locale === language.code ? 'is-active' : ''}`}
            aria-pressed={locale === language.code}
            onClick={() => setLocale(language.code)}
            aria-label={language.name}
          >
            <span className="lang-switch__mark">{mark(language.code)}</span>
          </button>
        </Tooltip>
      ))}
    </div>
  );
}
