export function Tile({ color, variant = 'colored', children, size = 20 }) {
  const mono = variant === 'mono';
  return (
    <svg
      className={`da-icon da-icon--tile ${mono ? 'is-mono' : ''}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      preserveAspectRatio="xMidYMid meet"
      style={{ '--da-icon-hole': mono ? 'var(--da-bg, #ffffff)' : color }}
      aria-hidden="true"
    >
      {!mono && <rect width="24" height="24" rx="7" fill={color} />}
      {children}
    </svg>
  );
}

function LineIcon({ children, size = 18 }) {
  return (
    <svg
      className="da-icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      preserveAspectRatio="xMidYMid meet"
      stroke="currentColor"
      strokeWidth="1.55"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export function IconMark({ variant = 'colored' } = {}) {
  return (
    <Tile color="#1E3A6E" variant={variant}>
      <path
        fill="#fff"
        d="M12 4.4 18.6 8v8L12 19.6 5.4 16V8L12 4.4Zm0 3.2L8.2 9.7v4.6L12 16.4l3.8-2.1V9.7L12 7.6Z"
      />
    </Tile>
  );
}

export function IconDashboard({ variant = 'colored' } = {}) {
  return (
    <Tile color="#3B5BDB" variant={variant}>
      <rect x="5.2" y="5.2" width="6" height="6" rx="1.6" fill="#fff" />
      <rect x="12.8" y="5.2" width="6" height="3.8" rx="1.4" fill="#fff" opacity="0.75" />
      <rect x="12.8" y="10.4" width="6" height="8.4" rx="1.6" fill="#fff" />
      <rect x="5.2" y="12.6" width="6" height="6.2" rx="1.6" fill="#fff" opacity="0.8" />
    </Tile>
  );
}

export function IconProject({ variant = 'colored' } = {}) {
  return (
    <Tile color="#4263EB" variant={variant}>
      <path
        fill="#fff"
        d="M6.2 8.2A1.8 1.8 0 0 1 8 6.4h2.1l1.1 1.4H16a1.8 1.8 0 0 1 1.8 1.8v7.2A1.8 1.8 0 0 1 16 18.6H8A1.8 1.8 0 0 1 6.2 16.8V8.2Z"
      />
    </Tile>
  );
}

export function IconGeneral({ variant = 'colored' } = {}) {
  return (
    <Tile color="#5C7CFA" variant={variant}>
      <path
        fill="#fff"
        d="M7.2 7.4h9.6a.9.9 0 0 1 0 1.8H7.2a.9.9 0 1 1 0-1.8Zm0 3.7h9.6a.9.9 0 0 1 0 1.8H7.2a.9.9 0 1 1 0-1.8Zm0 3.7h9.6a.9.9 0 0 1 0 1.8H7.2a.9.9 0 1 1 0-1.8Z"
      />
      <circle cx="9.4" cy="8.3" r="1.15" fill="var(--da-icon-hole)" />
      <circle cx="14.6" cy="12" r="1.15" fill="var(--da-icon-hole)" />
      <circle cx="10.6" cy="15.7" r="1.15" fill="var(--da-icon-hole)" />
    </Tile>
  );
}

export function IconPalette({ variant = 'colored' } = {}) {
  return (
    <Tile color="#F08C00" variant={variant}>
      <path
        fill="#fff"
        d="M12 5.2a6.8 6.8 0 1 0 0 13.6 2 2 0 0 0 1.5-3.4 1.9 1.9 0 0 1 1.6-3.2h.3A6.8 6.8 0 0 0 12 5.2Z"
      />
      <circle cx="9.4" cy="9.4" r="1" fill="#FA5252" data-accent="true" />
      <circle cx="13.4" cy="8.8" r="1" fill="#4C6EF5" data-accent="true" />
      <circle cx="8.8" cy="12.8" r="1" fill="#40C057" data-accent="true" />
    </Tile>
  );
}

export function IconType({ variant = 'colored' } = {}) {
  return (
    <Tile color="#F59F00" variant={variant}>
      <path
        fill="#fff"
        d="M7.1 16.8 10.6 7.4h2.8l3.5 9.4h-2.2l-.7-2H9.9l-.7 2H7.1Zm3.4-3.6h3l-1.5-4.2h-.1L10.5 13.2ZM17.2 7.4h2.2v9.4h-2.2V7.4Z"
      />
    </Tile>
  );
}

export function IconApps({ variant = 'colored' } = {}) {
  return (
    <Tile color="#FD7E14" variant={variant}>
      <rect x="5.2" y="5.2" width="5.6" height="5.6" rx="1.4" fill="#fff" />
      <rect x="13.2" y="5.2" width="5.6" height="5.6" rx="1.4" fill="#fff" opacity="0.8" />
      <rect x="5.2" y="13.2" width="5.6" height="5.6" rx="1.4" fill="#fff" opacity="0.8" />
      <rect x="13.2" y="13.2" width="5.6" height="5.6" rx="1.4" fill="#fff" />
    </Tile>
  );
}

export function IconIntegrations({ variant = 'colored' } = {}) {
  return (
    <Tile color="#7C3AED" variant={variant}>
      <circle cx="8.2" cy="8.2" r="2.15" fill="#fff" />
      <circle cx="15.8" cy="8.6" r="2.15" fill="#fff" />
      <circle cx="9.2" cy="15.8" r="2.15" fill="#fff" />
      <circle cx="16.2" cy="15.4" r="1.7" fill="#fff" opacity="0.8" />
      <path
        stroke="#fff"
        strokeWidth="1.5"
        d="M10 9.2 13.8 9.6M10.4 14.4 14.2 10.2M11.2 15.6 14.6 15.4"
      />
    </Tile>
  );
}

export function IconMail({ variant = 'colored' } = {}) {
  return (
    <Tile color="#EA4335" variant={variant}>
      <rect x="5.2" y="7.2" width="13.6" height="9.6" rx="1.8" fill="#fff" />
      <path d="M6.1 8.4 12 12.4 17.9 8.4" stroke="var(--da-icon-hole)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </Tile>
  );
}

export function IconTelegram({ variant = 'colored' } = {}) {
  return (
    <Tile color="#229ED9" variant={variant}>
      <g transform="translate(2.2 2.2) scale(0.816)">
        <path
          fill="#fff"
          d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"
        />
      </g>
    </Tile>
  );
}

export function IconWhatsapp({ variant = 'colored' } = {}) {
  return (
    <Tile color="#25D366" variant={variant}>
      <g transform="translate(2.2 2.2) scale(0.816)">
        <path
          fill="#fff"
          d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"
        />
      </g>
    </Tile>
  );
}

export function IconWazzup({ variant = 'colored' } = {}) {
  return (
    <Tile color="#6C4CF1" variant={variant}>
      <path
        fill="#fff"
        d="M5.2 6.6c0-1 .8-1.8 1.8-1.8h7.4c1 0 1.8.8 1.8 1.8v4.6c0 1-.8 1.8-1.8 1.8H10l-2.9 2.3c-.3.2-.7 0-.7-.4V13c-.7-.1-1.2-.8-1.2-1.6V6.6Z"
      />
      <path
        data-accent
        fill="#fff"
        fillOpacity=".55"
        d="M17.6 9.2h.2c.6 0 1 .5 1 1v4.6c0 .7-.4 1.3-1 1.5v1.9c0 .3-.4.5-.6.3l-2.4-1.9h-3.4c-.6 0-1-.4-1-1v-.3h4c1.8 0 3.2-1.4 3.2-3.2V9.2Z"
      />
    </Tile>
  );
}

export function IconMattermost({ variant = 'colored' } = {}) {
  return (
    <Tile color="#1E325C" variant={variant}>
      <path
        fill="#fff"
        d="M15.6 5.2l.1 1.6a6.3 6.3 0 1 1-7.4 0l.1-1.6A7.8 7.8 0 1 0 15.6 5.2z"
      />
      <path fill="#fff" data-accent d="M13.7 4.6l-.1 4.8a1.6 1.6 0 1 1-3.2 0l-.1-4.8 1.7 1z" />
    </Tile>
  );
}

/** Google "G": four brand colours on a white tile; a single-colour G in mono. */
export function IconGoogle({ variant = 'colored', size = 20 } = {}) {
  const mono = variant === 'mono';
  const paths = [
    ['#4285F4', 'M19.6 12.2c0-.6-.1-1.1-.2-1.6H12v3.1h4.3a3.7 3.7 0 0 1-1.6 2.4v2h2.6c1.5-1.4 2.3-3.4 2.3-5.9Z'],
    ['#34A853', 'M12 20c2.2 0 4-.7 5.3-1.9l-2.6-2c-.7.5-1.6.8-2.7.8-2.1 0-3.9-1.4-4.5-3.3H4.8v2.1A8 8 0 0 0 12 20Z'],
    ['#FBBC05', 'M7.5 13.6a4.8 4.8 0 0 1 0-3.1V8.3H4.8a8 8 0 0 0 0 7.3l2.7-2Z'],
    ['#EA4335', 'M12 7.2c1.2 0 2.3.4 3.1 1.2l2.3-2.3A8 8 0 0 0 4.8 8.3l2.7 2.1c.6-1.9 2.4-3.2 4.5-3.2Z'],
  ];
  return (
    <svg className={`da-icon da-icon--tile ${mono ? 'is-mono' : ''}`} width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {!mono && <rect x=".5" y=".5" width="23" height="23" rx="6.5" fill="#fff" stroke="#E2E8F0" />}
      {paths.map(([color, d]) => (
        <path key={color} d={d} fill={mono ? 'currentColor' : color} />
      ))}
    </svg>
  );
}

export function IconDirectory({ variant = 'colored' } = {}) {
  return (
    <Tile color="#0078D4" variant={variant}>
      <rect x="5.4" y="5.6" width="5.4" height="4.4" rx="1.1" fill="#fff" />
      <rect x="13.2" y="9.8" width="5.4" height="4.4" rx="1.1" fill="#fff" />
      <rect x="5.8" y="14.2" width="5.4" height="4.2" rx="1.1" fill="#fff" opacity="0.85" />
      <path
        d="M8.1 10v1.6c0 1 .8 1.7 1.8 1.7h3.3M8.5 13.8v.4"
        stroke="#fff"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </Tile>
  );
}

export function IconPeople({ variant = 'colored' } = {}) {
  return (
    <Tile color="#0CA678" variant={variant}>
      <circle cx="10" cy="9" r="2.35" fill="#fff" />
      <path fill="#fff" d="M5.8 17.2c.35-2.6 1.95-4 4.2-4s3.85 1.4 4.2 4H5.8Z" />
      <circle cx="15.6" cy="9.4" r="2" fill="#fff" opacity="0.85" />
      <path fill="#fff" opacity="0.85" d="M14.7 13.4c1.9.2 3.2 1.5 3.55 3.8h-3.4c-.2-1.5-.8-2.8-2-3.5.55-.1 1.2-.2 1.85-.3Z" />
    </Tile>
  );
}

export function IconUser({ variant = 'colored' } = {}) {
  return (
    <Tile color="#15AABF" variant={variant}>
      <circle cx="12" cy="9.1" r="2.8" fill="#fff" />
      <path fill="#fff" d="M6.2 17.6c.6-3.1 2.7-4.8 5.8-4.8s5.2 1.7 5.8 4.8H6.2Z" />
    </Tile>
  );
}

export function IconShield({ variant = 'colored' } = {}) {
  return (
    <Tile color="#2F9E44" variant={variant}>
      <path
        fill="#fff"
        d="M12 5.2 17.6 7v4.4c0 3.5-2.3 5.9-5.6 7-3.3-1.1-5.6-3.5-5.6-7V7L12 5.2Z"
      />
      <path
        d="m9.4 11.8 1.8 1.8 3.5-3.6"
        stroke="var(--da-icon-hole)"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Tile>
  );
}

export function IconLock({ variant = 'colored' } = {}) {
  return (
    <Tile color="#E03131" variant={variant}>
      <path
        d="M8.4 10.6V8.8a3.6 3.6 0 0 1 7.2 0v1.8"
        stroke="#fff"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <rect x="6.8" y="10.6" width="10.4" height="7.2" rx="2" fill="#fff" />
      <circle cx="12" cy="13.8" r="1.05" fill="var(--da-icon-hole)" />
      <path d="M12 14.6v1.6" stroke="var(--da-icon-hole)" strokeWidth="1.5" strokeLinecap="round" />
    </Tile>
  );
}

export function IconNetwork({ variant = 'colored' } = {}) {
  return (
    <Tile color="#1098AD" variant={variant}>
      <circle cx="12" cy="12" r="5.4" stroke="#fff" strokeWidth="1.6" />
      <path
        d="M12 6.6v10.8M6.6 12h10.8M8.1 8.1l7.8 7.8M15.9 8.1l-7.8 7.8"
        stroke="#fff"
        strokeWidth="1.35"
        strokeLinecap="round"
      />
      <circle cx="12" cy="12" r="1.7" fill="#fff" />
    </Tile>
  );
}

export function IconHome({ variant = 'colored' } = {}) {
  return (
    <Tile color="#364FC7" variant={variant}>
      <path fill="#fff" d="M5.6 11.2 12 5.6l6.4 5.6v7.2A1.6 1.6 0 0 1 16.8 20h-3.2v-4.4h-3.2V20H7.2A1.6 1.6 0 0 1 5.6 18.4v-7.2Z" />
    </Tile>
  );
}

export function IconStar({ variant = 'colored' } = {}) {
  return (
    <Tile color="#F08C00" variant={variant}>
      <path fill="#fff" d="m12 5.4 1.7 3.6 4 .6-2.9 2.8.7 4-3.5-1.9-3.5 1.9.7-4-2.9-2.8 4-.6L12 5.4Z" />
    </Tile>
  );
}

export function IconBolt({ variant = 'colored' } = {}) {
  return (
    <Tile color="#FAB005" variant={variant}>
      <path fill="#fff" d="M13.4 4.8 7.2 13.2h4l-1 6 6.6-9.2h-4.2l1.8-5.2Z" />
    </Tile>
  );
}

export function IconChart({ variant = 'colored' } = {}) {
  return (
    <Tile color="#2F9E44" variant={variant}>
      <path fill="#fff" d="M6.4 16.8V9.6h2.6v7.2H6.4Zm4.3 0V6.8h2.6v10H10.7Zm4.3 0v-4.4h2.6v4.4H15Z" />
    </Tile>
  );
}

export function IconCalendar({ variant = 'colored' } = {}) {
  return (
    <Tile color="#E8590C" variant={variant}>
      <rect x="5.6" y="6.8" width="12.8" height="11.2" rx="2" fill="#fff" />
      <path d="M8 5.8v2.4M16 5.8v2.4M5.6 10.2h12.8" stroke="var(--da-icon-hole)" strokeWidth="1.5" strokeLinecap="round" />
    </Tile>
  );
}

export function IconFile({ variant = 'colored' } = {}) {
  return (
    <Tile color="#4C6EF5" variant={variant}>
      <path fill="#fff" d="M8 5.6h5.2L17.2 9.6V18a1.6 1.6 0 0 1-1.6 1.6H8A1.6 1.6 0 0 1 6.4 18V7.2A1.6 1.6 0 0 1 8 5.6Z" />
      <path d="M13.2 5.8v3.8h3.8" stroke="var(--da-icon-hole)" strokeWidth="1.4" />
    </Tile>
  );
}

export function IconGlobe({ variant = 'colored' } = {}) {
  return (
    <Tile color="#1098AD" variant={variant}>
      <circle cx="12" cy="12" r="5.6" stroke="#fff" strokeWidth="1.7" />
      <path d="M6.4 12h11.2M12 6.4c1.8 1.6 2.8 3.6 2.8 5.6S13.8 16 12 17.6C10.2 16 9.2 14 9.2 12S10.2 8 12 6.4Z" stroke="#fff" strokeWidth="1.35" />
    </Tile>
  );
}

export function IconKey({ variant = 'colored' } = {}) {
  return (
    <Tile color="#868E96" variant={variant}>
      <circle cx="9.2" cy="12" r="2.6" stroke="#fff" strokeWidth="1.7" />
      <path d="M11.4 12h6.2v2.2M15.2 12v2.2" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" />
    </Tile>
  );
}

export function IconBell({ variant = 'colored' } = {}) {
  return (
    <Tile color="#F08C00" variant={variant}>
      <path fill="#fff" d="M12 4.8a4.4 4.4 0 0 1 4.4 4.4v3.1l1.2 2.1H6.4l1.2-2.1V9.2A4.4 4.4 0 0 1 12 4.8ZM9.8 17.4a2.2 2.2 0 0 0 4.4 0H9.8Z" />
    </Tile>
  );
}

export function IconBox({ variant = 'colored' } = {}) {
  return (
    <Tile color="#845EF7" variant={variant}>
      <path fill="#fff" d="M6 8.2 12 5.4 18 8.2v7.6L12 18.6 6 15.8V8.2Z" />
      <path d="M6.2 8.4 12 11.2 17.8 8.4M12 11.2V18" stroke="var(--da-icon-hole)" strokeWidth="1.4" />
    </Tile>
  );
}

export function IconChat({ variant = 'colored' } = {}) {
  return (
    <Tile color="#228BE6" variant={variant}>
      <path fill="#fff" d="M6.2 6.8h11.6A1.8 1.8 0 0 1 19.6 8.6v6.2a1.8 1.8 0 0 1-1.8 1.8H11l-3.6 2.6v-2.6H6.2A1.8 1.8 0 0 1 4.4 14.8V8.6A1.8 1.8 0 0 1 6.2 6.8Z" />
    </Tile>
  );
}

export function IconServer({ variant = 'colored' } = {}) {
  return (
    <Tile color="#495057" variant={variant}>
      <rect x="5.6" y="5.8" width="12.8" height="4.2" rx="1.3" fill="#fff" />
      <rect x="5.6" y="14" width="12.8" height="4.2" rx="1.3" fill="#fff" />
      <circle cx="8.2" cy="7.9" r="0.7" fill="var(--da-icon-hole)" />
      <circle cx="8.2" cy="16.1" r="0.7" fill="var(--da-icon-hole)" />
    </Tile>
  );
}

export function IconTag({ variant = 'colored' } = {}) {
  return (
    <Tile color="#E64980" variant={variant}>
      <path fill="#fff" d="M6.4 6.4h6.2l5 5-6.2 6.2-5-5V6.4Z" />
      <circle cx="9.2" cy="9.2" r="1" fill="var(--da-icon-hole)" />
    </Tile>
  );
}

export function IconLayers({ variant = 'colored' } = {}) {
  return (
    <Tile color="#5C7CFA" variant={variant}>
      <path fill="#fff" d="m12 5.4 6.4 3.2L12 11.8 5.6 8.6 12 5.4Zm-5.6 6.6L12 15.2l5.6-3.2L12 16.8 6.4 12Z" />
    </Tile>
  );
}

export function IconSpark({ variant = 'colored' } = {}) {
  return (
    <Tile color="#BE4BDB" variant={variant}>
      <path fill="#fff" d="M12 4.8 13.4 10 18.8 12 13.4 14 12 19.2 10.6 14 5.2 12 10.6 10 12 4.8Z" />
    </Tile>
  );
}

export function IconSun() {
  return (
    <LineIcon>
      <circle cx="12" cy="12" r="3.4" />
      <path d="M12 4.4v1.8M12 17.8v1.8M4.4 12h1.8M17.8 12h1.8" />
      <path d="m6.8 6.8 1.3 1.3M15.9 15.9l1.3 1.3M17.2 6.8 15.9 8.1M8.1 15.9 6.8 17.2" />
    </LineIcon>
  );
}

export function IconMoon() {
  return (
    <LineIcon>
      <path d="M16.6 14.8A6.4 6.4 0 0 1 9.2 7.4 5.8 5.8 0 1 0 16.6 14.8Z" />
    </LineIcon>
  );
}

export function IconAdmin() {
  return (
    <LineIcon>
      <rect x="4.6" y="4.6" width="6.4" height="6.4" rx="1.4" />
      <rect x="13" y="4.6" width="6.4" height="6.4" rx="1.4" />
      <rect x="4.6" y="13" width="6.4" height="6.4" rx="1.4" />
      <rect x="13" y="13" width="6.4" height="6.4" rx="1.4" />
    </LineIcon>
  );
}

export function IconLogin() {
  return (
    <LineIcon>
      <path d="M14.2 5H16a2.4 2.4 0 0 1 2.4 2.4v9.2A2.4 2.4 0 0 1 16 19h-1.8" />
      <path d="M13.2 12H4.8M8.2 8.4 4.8 12l3.4 3.6" />
    </LineIcon>
  );
}

export function IconLogout() {
  return (
    <LineIcon>
      <path d="M9.8 5H8a2.4 2.4 0 0 0-2.4 2.4v9.2A2.4 2.4 0 0 0 8 19h1.8" />
      <path d="M10.8 12h8.4M16.2 8.4 19.6 12l-3.4 3.6" />
    </LineIcon>
  );
}
