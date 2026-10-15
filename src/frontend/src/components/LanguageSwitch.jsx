import { Tooltip } from 'antd';
import { useLocale } from '../context/LocaleContext';

function FlagEN() {
  return (
    <svg className="lang-switch__flag" viewBox="0 0 60 36" aria-hidden="true">
      <clipPath id="da-flag-en">
        <rect width="60" height="36" rx="3" />
      </clipPath>
      <g clipPath="url(#da-flag-en)">
        <rect width="60" height="36" fill="#012169" />
        <path d="M0 0 60 36M60 0 0 36" stroke="#fff" strokeWidth="8" />
        <path d="M0 0 60 36M60 0 0 36" stroke="#C8102E" strokeWidth="5" />
        <path d="M30 0v36M0 18h60" stroke="#fff" strokeWidth="14" />
        <path d="M30 0v36M0 18h60" stroke="#C8102E" strokeWidth="8" />
      </g>
    </svg>
  );
}

function FlagRU() {
  return (
    <svg className="lang-switch__flag" viewBox="0 0 60 36" aria-hidden="true">
      <clipPath id="da-flag-ru">
        <rect width="60" height="36" rx="3" />
      </clipPath>
      <g clipPath="url(#da-flag-ru)">
        <rect width="60" height="12" fill="#fff" />
        <rect y="12" width="60" height="12" fill="#0039A6" />
        <rect y="24" width="60" height="12" fill="#D52B1E" />
      </g>
    </svg>
  );
}

export const FLAGS = [
  { id: 'en', title: 'English', mark: 'EN', icon: <FlagEN /> },
  { id: 'ru', title: 'Русский', mark: 'RU', icon: <FlagRU /> },
];

export default function LanguageSwitch() {
  const { locale, setLocale } = useLocale();

  return (
    <div className="lang-switch" role="group" aria-label="Language">
      {FLAGS.map((flag) => (
        <Tooltip key={flag.id} title={flag.title} mouseEnterDelay={0.15}>
          <button
            type="button"
            className={`lang-switch__btn ${locale === flag.id ? 'is-active' : ''}`}
            onClick={() => setLocale(flag.id)}
            aria-label={flag.title}
          >
            {flag.icon}
          </button>
        </Tooltip>
      ))}
    </div>
  );
}
