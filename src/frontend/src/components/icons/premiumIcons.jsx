import { Tile } from './AdminIcons';

const S = {
  fill: 'none',
  stroke: '#fff',
  strokeWidth: 1.65,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
};

function icon(color, render) {
  function PremiumIcon({ variant = 'colored' } = {}) {
    return (
      <Tile color={color} variant={variant}>
        {render()}
      </Tile>
    );
  }
  return PremiumIcon;
}

export const PREMIUM_ICONS = {
  tasks: icon('#0CA678', () => (
    <>
      <rect x="5.4" y="5.4" width="13.2" height="13.2" rx="3" fill="#fff" />
      <path d="m8.2 9.4 1.3 1.3 2.3-2.4M13.4 9.6h2.6M8.2 14.2l1.3 1.3 2.3-2.4M13.4 14.4h2.6" stroke="var(--da-icon-hole)" strokeWidth="1.45" strokeLinecap="round" strokeLinejoin="round" />
    </>
  )),
  folder: icon('#3B82F6', () => (
    <path
      fill="#fff"
      d="M5.2 8.1c0-.9.7-1.6 1.6-1.6h3.1c.5 0 .9.2 1.2.5l1 1.1h5.1c.9 0 1.6.7 1.6 1.6v6.8c0 .9-.7 1.6-1.6 1.6H6.8c-.9 0-1.6-.7-1.6-1.6V8.1Z"
    />
  )),
  book: icon('#4F46E5', () => (
    <>
      <path fill="#fff" d="M6.4 6.2c0-.7.6-1.2 1.2-1.2h8.9c.5 0 .9.4.9.9v10.4c0 .5-.4.9-.9.9H8a1.6 1.6 0 0 0-1.6 1.6V6.2Z" />
      <path d="M8 17.2a1.6 1.6 0 0 0 0 3.2h9.4M6.4 6.2v12.6" {...S} />
      <path d="M9.6 8.6h5.2M9.6 11h3.6" stroke="var(--da-icon-hole)" strokeWidth="1.4" strokeLinecap="round" />
    </>
  )),
  // Mortarboard: the Knowledge base app icon. Board, cap and tassel are separate
  // shapes so the gaps show the tile (or the page in mono) at 16px too.
  graduation: icon('#4F46E5', () => (
    <>
      <path fill="#fff" d="M12 6.3 19.2 9.8 12 13.3 4.8 9.8 12 6.3Z" />
      <path fill="#fff" d="M8.1 12.7 12 14.6l3.9-1.9v2.9c0 1.2-1.75 2.1-3.9 2.1s-3.9-.9-3.9-2.1v-2.9Z" />
      <path d="m12 9.8 5.3 1" stroke="var(--da-icon-hole)" strokeWidth="1.1" strokeLinecap="round" />
      <path d="M17.3 10.8v3.6" {...S} />
      <path fill="#fff" d="M16.5 14.6h1.6l.5 2.3h-2.6l.5-2.3Z" />
    </>
  )),
  compass: icon('#1C7ED6', () => (
    <>
      <circle cx="12" cy="12" r="5.7" {...S} />
      <path fill="#fff" d="m12 7.2 1.55 3.5 3.55 1.3-3.55 1.3L12 16.8l-1.55-3.5L6.9 12l3.55-1.3L12 7.2Z" />
    </>
  )),
  map: icon('#2F9E44', () => (
    <path
      fill="#fff"
      d="M6.2 6.6 10.4 5.2v13.2L6.2 19.8V6.6Zm4.6-1.2 4.6 1.6v13.2l-4.6-1.6V5.4Zm5 1.6 2.8-1.2v13.2l-2.8 1.4V7Z"
    />
  )),
  pin: icon('#E03131', () => (
    <>
      <path fill="#fff" d="M12 5.4a5 5 0 0 1 5 5c0 3.4-5 8.2-5 8.2S7 13.8 7 10.4a5 5 0 0 1 5-5Z" />
      <circle cx="12" cy="10.2" r="1.55" fill="var(--da-icon-hole)" />
    </>
  )),
  flag: icon('#FA5252', () => (
    <>
      <path d="M7.4 5.6v13" {...S} />
      <path fill="#fff" d="M8.2 6.2h8.4l-1.8 2.8 1.8 2.8H8.2V6.2Z" />
    </>
  )),
  bookmark: icon('#BE4BDB', () => (
    <path fill="#fff" d="M8 5.6h8A1.4 1.4 0 0 1 17.4 7v12.2L12 16.2 6.6 19.2V7A1.4 1.4 0 0 1 8 5.6Z" />
  )),
  heart: icon('#E64980', () => (
    <path
      fill="#fff"
      d="M12 18.2S5.6 14 5.6 10.2A3.5 3.5 0 0 1 12 8.1a3.5 3.5 0 0 1 6.4 2.1C18.4 14 12 18.2 12 18.2Z"
    />
  )),
  thumb: icon('#12B886', () => (
    <path
      fill="#fff"
      d="M9.2 10.2V18H7.2A1.6 1.6 0 0 1 5.6 16.4v-4.6A1.6 1.6 0 0 1 7.2 10.2h2Zm1.6 0 2-4.4a1.5 1.5 0 0 1 2.8.9V10h3a1.6 1.6 0 0 1 1.6 1.9l-.9 5A1.6 1.6 0 0 1 17.8 18H10.8v-7.8Z"
    />
  )),
  eye: icon('#15AABF', () => (
    <>
      <path d="M5.2 12s2.6-5 6.8-5 6.8 5 6.8 5-2.6 5-6.8 5-6.8-5-6.8-5Z" {...S} />
      <circle cx="12" cy="12" r="2.05" fill="#fff" />
    </>
  )),
  search: icon('#4C6EF5', () => (
    <>
      <circle cx="11" cy="11" r="4.3" {...S} />
      <path d="m14.4 14.4 4 4" {...S} />
    </>
  )),
  filter: icon('#7950F2', () => (
    <path fill="#fff" d="M6 6.4h12l-4.2 5.2v5.2L10.2 18v-6.4L6 6.4Z" />
  )),
  sliders: icon('#5C7CFA', () => (
    <>
      <path d="M6.4 8.2h11.2M6.4 12h11.2M6.4 15.8h11.2" {...S} />
      <circle cx="9.4" cy="8.2" r="1.35" fill="#fff" />
      <circle cx="14.8" cy="12" r="1.35" fill="#fff" />
      <circle cx="10.6" cy="15.8" r="1.35" fill="#fff" />
    </>
  )),
  cog: icon('#868E96', () => (
    <>
      <path
        fill="#fff"
        d="M10.15 5.5h3.7l.45 1.9 1.7.7 1.65-1.1 2.6 2.6-1.1 1.65.7 1.7 1.9.45v3.7l-1.9.45-.7 1.7 1.1 1.65-2.6 2.6-1.65-1.1-1.7.7-.45 1.9h-3.7l-.45-1.9-1.7-.7-1.65 1.1-2.6-2.6 1.1-1.65-.7-1.7-1.9-.45v-3.7l1.9-.45.7-1.7-1.1-1.65 2.6-2.6 1.65 1.1 1.7-.7.45-1.9Z"
      />
      <circle cx="12" cy="12" r="2.15" fill="var(--da-icon-hole)" />
    </>
  )),
  wrench: icon('#D9480F', () => (
    <path
      fill="#fff"
      d="M16.8 6.4a3.4 3.4 0 0 0-4.6.2l-5.6 5.6 2.4 2.4 5.6-5.6a3.4 3.4 0 0 0 .2-4.6Zm-8.7 7.3-2.3 2.3a1.4 1.4 0 0 0 0 2l1.2 1.2a1.4 1.4 0 0 0 2 0l2.3-2.3-3.2-3.2Z"
    />
  )),
  code: icon('#364FC7', () => (
    <path d="m9 8.2-3.6 3.8L9 15.8M15 8.2l3.6 3.8-3.6 3.8M13.2 7.2l-2.4 9.6" {...S} />
  )),
  terminal: icon('#212529', () => (
    <>
      <rect x="5.4" y="6.2" width="13.2" height="11.6" rx="2" {...S} />
      <path d="m8 10 2.2 2-2.2 2M12.2 14.4H16" {...S} />
    </>
  )),
  database: icon('#0B7285', () => (
    <>
      <ellipse cx="12" cy="7.4" rx="5.4" ry="1.9" fill="#fff" />
      <path d="M6.6 7.4v9.2c0 1 2.4 1.9 5.4 1.9s5.4-.9 5.4-1.9V7.4" {...S} />
      <path d="M6.6 11.2c0 1 2.4 1.9 5.4 1.9s5.4-.9 5.4-1.9M6.6 14.6c0 1 2.4 1.9 5.4 1.9s5.4-.9 5.4-1.9" {...S} />
    </>
  )),
  cloud: icon('#228BE6', () => (
    <path
      fill="#fff"
      d="M8.6 16.8h7.6a3.4 3.4 0 0 0 .5-6.76 4.4 4.4 0 0 0-8.3-1.1A3.2 3.2 0 0 0 8.6 16.8Z"
    />
  )),
  download: icon('#2F9E44', () => (
    <path d="M12 6.2v8.2M8.6 11.2 12 14.6l3.4-3.4M6.4 17.8h11.2" {...S} />
  )),
  upload: icon('#40C057', () => (
    <path d="M12 14.4V6.2M8.6 9.2 12 5.8l3.4 3.4M6.4 17.8h11.2" {...S} />
  )),
  link: icon('#4C6EF5', () => (
    <path d="M10 13.6 8.4 15.2a2.4 2.4 0 0 1-3.4-3.4L6.6 10M14 10.4l1.6-1.6a2.4 2.4 0 1 1 3.4 3.4L17.4 14M9.6 14.4l4.8-4.8" {...S} />
  )),
  share: icon('#7950F2', () => (
    <>
      <circle cx="16.4" cy="7.6" r="1.7" fill="#fff" />
      <circle cx="7.4" cy="12" r="1.7" fill="#fff" />
      <circle cx="16.4" cy="16.4" r="1.7" fill="#fff" />
      <path d="m8.8 11.2 5.8-2.6M8.8 12.8l5.8 2.6" {...S} />
    </>
  )),
  image: icon('#15AABF', () => (
    <>
      <rect x="5.6" y="6.6" width="12.8" height="10.8" rx="1.8" {...S} />
      <circle cx="9.2" cy="10.2" r="1.15" fill="#fff" />
      <path d="m6.4 15.6 3.4-3.2 2.4 2.2 2.2-2 3.2 3" {...S} />
    </>
  )),
  camera: icon('#495057', () => (
    <>
      <path fill="#fff" d="M8.2 7.2h2l1-1.4h1.6l1 1.4h2A2 2 0 0 1 17.8 9.2v6.4a2 2 0 0 1-2 2H8.2a2 2 0 0 1-2-2V9.2a2 2 0 0 1 2-2Z" />
      <circle cx="12" cy="12.4" r="2.15" fill="var(--da-icon-hole)" />
    </>
  )),
  video: icon('#E03131', () => (
    <>
      <rect x="5.4" y="7.4" width="9.2" height="9.2" rx="1.8" fill="#fff" />
      <path fill="#fff" d="m15.2 10 3.4-1.6v7.2L15.2 14V10Z" />
    </>
  )),
  music: icon('#BE4BDB', () => (
    <>
      <path d="M10.2 16.6V8.2l7.2-1.6v8.2" {...S} />
      <circle cx="8.4" cy="16.6" r="1.9" fill="#fff" />
      <circle cx="15.6" cy="14.8" r="1.9" fill="#fff" />
    </>
  )),
  mic: icon('#E8590C', () => (
    <>
      <rect x="9.4" y="5.6" width="5.2" height="8.2" rx="2.6" fill="#fff" />
      <path d="M7.4 12.4a4.6 4.6 0 0 0 9.2 0M12 17v1.6" {...S} />
    </>
  )),
  phone: icon('#2F9E44', () => (
    <path
      fill="#fff"
      d="M8.2 5.8h2.2l1 3.2-1.5 1.1a9 9 0 0 0 4 4l1.1-1.5 3.2 1v2.2a1.6 1.6 0 0 1-1.7 1.6A11.4 11.4 0 0 1 6.6 7.5 1.6 1.6 0 0 1 8.2 5.8Z"
    />
  )),
  inbox: icon('#1C7ED6', () => (
    <>
      <path d="M5.8 12.2 7.6 6.8h8.8l1.8 5.4v5a1.6 1.6 0 0 1-1.6 1.6H7.4A1.6 1.6 0 0 1 5.8 17.2v-5Z" {...S} />
      <path d="M5.8 12.2h3.4l.8 1.8h4l.8-1.8h3.4" {...S} />
    </>
  )),
  send: icon('#228BE6', () => (
    <path fill="#fff" d="M5.4 11.2 18.6 6.4 14 18.2l-2.2-5.2-6.4-1.8Z" />
  )),
  clipboard: icon('#5C7CFA', () => (
    <>
      <path d="M8.4 7.4h-.8A1.6 1.6 0 0 0 6 9v8.6A1.6 1.6 0 0 0 7.6 19.2h8.8A1.6 1.6 0 0 0 18 17.6V9a1.6 1.6 0 0 0-1.6-1.6h-.8" {...S} />
      <rect x="8.8" y="5.4" width="6.4" height="3.2" rx="1" fill="#fff" />
    </>
  )),
  checklist: icon('#12B886', () => (
    <>
      <path d="M6.4 8.2 7.8 9.6 10.2 7M6.4 12.4 7.8 13.8 10.2 11.2M6.4 16.6 7.8 18 10.2 15.4" {...S} />
      <path d="M12.2 8.4h5.6M12.2 12.6h5.6M12.2 16.8h5.6" {...S} />
    </>
  )),
  table: icon('#0CA678', () => (
    <>
      <rect x="5.6" y="6.4" width="12.8" height="11.2" rx="1.6" {...S} />
      <path d="M5.6 10h12.8M5.6 13.8h12.8M12 10v7.6" {...S} />
    </>
  )),
  kanban: icon('#4C6EF5', () => (
    <>
      <rect x="5.4" y="6.2" width="3.8" height="11.6" rx="1.1" fill="#fff" />
      <rect x="10.1" y="6.2" width="3.8" height="7.4" rx="1.1" fill="#fff" opacity="0.85" />
      <rect x="14.8" y="6.2" width="3.8" height="9.4" rx="1.1" fill="#fff" opacity="0.7" />
    </>
  )),
  clock: icon('#F08C00', () => (
    <>
      <circle cx="12" cy="12" r="5.7" {...S} />
      <path d="M12 8.4V12l2.6 1.8" {...S} />
    </>
  )),
  hourglass: icon('#FAB005', () => (
    <path
      fill="#fff"
      d="M7.4 5.6h9.2v2.2c0 1.6-1.4 2.8-3 3.6 1.6.8 3 2 3 3.6v2.2H7.4v-2.2c0-1.6 1.4-2.8 3-3.6-1.6-.8-3-2-3-3.6V5.6Z"
    />
  )),
  // Site plan: plots in a grid along a road, one highlighted (the Masterplan app icon).
  siteplan: icon('#0F766E', () => (
    <>
      <rect x="5.2" y="5.4" width="5.6" height="5" rx="1" fill="#fff" />
      <rect x="13.2" y="5.4" width="5.6" height="5" rx="1" fill="#fff" opacity=".55" />
      <rect x="5.2" y="13.6" width="5.6" height="5" rx="1" fill="#fff" opacity=".55" />
      <rect x="13.2" y="13.6" width="5.6" height="5" rx="1" fill="#fff" />
      <path d="M4.6 12h14.8" stroke="#fff" strokeWidth="1.3" strokeLinecap="round" strokeDasharray="1.6 1.6" />
    </>
  )),
  target: icon('#E03131', () => (
    <>
      <circle cx="12" cy="12" r="5.7" {...S} />
      <circle cx="12" cy="12" r="3.2" {...S} />
      <circle cx="12" cy="12" r="1.15" fill="#fff" />
    </>
  )),
  trophy: icon('#F59F00', () => (
    <>
      <path fill="#fff" d="M8.2 6.2h7.6v3.4a3.8 3.8 0 0 1-7.6 0V6.2Z" />
      <path d="M8.2 7.6H6.4A2 2 0 0 0 8.4 9.6M15.8 7.6h1.8A2 2 0 0 1 15.6 9.6M10 16.4h4M9.2 18.4h5.6M12 13.4v3" {...S} />
    </>
  )),
  gift: icon('#E64980', () => (
    <>
      <rect x="6" y="11" width="12" height="7.2" rx="1.4" fill="#fff" />
      <rect x="5.6" y="8.2" width="12.8" height="3" rx="1" fill="#fff" />
      <path d="M12 8.2v10M9.2 8.2c0-1.6 1.2-2.6 2.8-2.6S14.8 6.6 14.8 8.2" {...S} />
    </>
  )),
  cart: icon('#FD7E14', () => (
    <>
      <path d="M6 7.2h1.8l1.4 8.2h8" {...S} />
      <path d="m8.2 9.4 9.4.2-1 4.8H9.4" {...S} />
      <circle cx="10.2" cy="17.6" r="1.05" fill="#fff" />
      <circle cx="15.6" cy="17.6" r="1.05" fill="#fff" />
    </>
  )),
  wallet: icon('#12B886', () => (
    <>
      <rect x="5.6" y="7.4" width="12.8" height="9.4" rx="1.8" fill="#fff" />
      <rect x="13.2" y="10.6" width="5.2" height="3.2" rx="1" fill="var(--da-icon-hole)" />
    </>
  )),
  card: icon('#364FC7', () => (
    <>
      <rect x="5.2" y="7.2" width="13.6" height="9.6" rx="1.8" fill="#fff" />
      <path d="M5.2 10.4h13.6" stroke="var(--da-icon-hole)" strokeWidth="2" />
      <rect x="7.2" y="13.2" width="4.2" height="1.4" rx="0.5" fill="var(--da-icon-hole)" />
    </>
  )),
  pie: icon('#845EF7', () => (
    <>
      <path fill="#fff" d="M12 5.6a6.4 6.4 0 1 0 6.4 6.4H12V5.6Z" />
      <path fill="#fff" opacity="0.75" d="M13.2 5.8A6.4 6.4 0 0 1 18.4 12H13.2V5.8Z" />
    </>
  )),
  trend: icon('#2F9E44', () => (
    <path d="M5.8 15.6 10 11.2l2.6 2.4 5.6-6.2M14.8 7.4h3.4v3.4" {...S} />
  )),
  pulse: icon('#FA5252', () => (
    <path d="M5.2 12h3l1.6-4.2 2.4 8.4L14.6 12h4.2" {...S} />
  )),
  cpu: icon('#495057', () => (
    <>
      <rect x="7.4" y="7.4" width="9.2" height="9.2" rx="1.5" fill="#fff" />
      <rect x="9.6" y="9.6" width="4.8" height="4.8" rx="0.8" fill="var(--da-icon-hole)" />
      <path d="M12 5.6v1.8M12 16.6v1.8M5.6 12h1.8M16.6 12h1.8M7.8 7.8l-1.2-1.2M17.4 17.4l-1.2-1.2M16.2 7.8l1.2-1.2M6.6 17.4l1.2-1.2" {...S} />
    </>
  )),
  wifi: icon('#1C7ED6', () => (
    <>
      <path d="M6.2 10.2a8.2 8.2 0 0 1 11.6 0M8.2 12.6a5.4 5.4 0 0 1 7.6 0M10.2 15a2.6 2.6 0 0 1 3.6 0" {...S} />
      <circle cx="12" cy="17.4" r="1" fill="#fff" />
    </>
  )),
  printer: icon('#868E96', () => (
    <>
      <path fill="#fff" d="M7.2 5.6h9.6v3.2H7.2V5.6Z" />
      <path fill="#fff" d="M5.6 9.2h12.8v6.2H16v-2H8v2H5.6V9.2Z" />
      <rect x="8" y="13.4" width="8" height="5" rx="1" fill="#fff" />
    </>
  )),
  fingerprint: icon('#5C7CFA', () => (
    <>
      <path d="M12 16.8c0-2.6 2-3.6 2-5.6A3.8 3.8 0 1 0 8 12.2" {...S} />
      <path d="M9.4 17.2c.2-2 1.4-2.8 1.4-4.6M14.8 16.4c.6-1.4.8-2.4.8-3.8" {...S} />
    </>
  )),
  unlock: icon('#12B886', () => (
    <>
      <path d="M8.4 10.6V8.6a3.6 3.6 0 0 1 7-1.2" {...S} />
      <rect x="6.8" y="10.6" width="10.4" height="7.2" rx="2" fill="#fff" />
      <circle cx="12" cy="13.8" r="1.05" fill="var(--da-icon-hole)" />
    </>
  )),
  ban: icon('#E03131', () => (
    <>
      <circle cx="12" cy="12" r="5.7" {...S} />
      <path d="m8 8 8 8" {...S} />
    </>
  )),
  alert: icon('#F08C00', () => (
    <>
      <path fill="#fff" d="M12 5.6 19 17.6H5L12 5.6Z" />
      <path d="M12 10.2v3.2" stroke="var(--da-icon-hole)" strokeWidth="1.7" strokeLinecap="round" />
      <circle cx="12" cy="15.4" r="0.7" fill="var(--da-icon-hole)" />
    </>
  )),
  info: icon('#1C7ED6', () => (
    <>
      <circle cx="12" cy="12" r="5.7" fill="#fff" />
      <path d="M12 11v4.2" stroke="var(--da-icon-hole)" strokeWidth="1.7" strokeLinecap="round" />
      <circle cx="12" cy="8.8" r="0.75" fill="var(--da-icon-hole)" />
    </>
  )),
  help: icon('#7950F2', () => (
    <>
      <circle cx="12" cy="12" r="5.7" fill="#fff" />
      <path d="M10.2 9.4a1.8 1.8 0 1 1 2.4 1.7c-.6.4-1.1.8-1.1 1.6" stroke="var(--da-icon-hole)" strokeWidth="1.55" strokeLinecap="round" />
      <circle cx="12" cy="15.6" r="0.7" fill="var(--da-icon-hole)" />
    </>
  )),
  check: icon('#2F9E44', () => (
    <>
      <circle cx="12" cy="12" r="5.7" fill="#fff" />
      <path d="m8.8 12.1 2.1 2.1 4.3-4.4" stroke="var(--da-icon-hole)" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </>
  )),
  edit: icon('#F76707', () => (
    <path
      fill="#fff"
      d="m7 15.6-.4 2.8 2.8-.4 7.8-7.8-2.4-2.4L7 15.6Zm10.2-7.8 1.2-1.2a1.2 1.2 0 0 0 0-1.7L17 3.6a1.2 1.2 0 0 0-1.7 0l-1.2 1.2 2.4 2.4 1.7.6Z"
    />
  )),
  trash: icon('#C92A2A', () => (
    <>
      <path d="M7 8.4h10M9.2 8.4V6.8A1.2 1.2 0 0 1 10.4 5.6h3.2A1.2 1.2 0 0 1 14.8 6.8v1.6M8.2 8.4 9 18h6l.8-9.6" {...S} />
    </>
  )),
  archive: icon('#5C7CFA', () => (
    <>
      <rect x="5.4" y="6" width="13.2" height="3.2" rx="1" fill="#fff" />
      <path d="M6.6 9.2h10.8v8A1.4 1.4 0 0 1 16 18.6H8A1.4 1.4 0 0 1 6.6 17.2v-8Z" {...S} />
      <path d="M10 12.4h4" {...S} />
    </>
  )),
  briefcase: icon('#495057', () => (
    <>
      <rect x="5.4" y="8.4" width="13.2" height="9.2" rx="1.8" fill="#fff" />
      <path d="M9 8.4V7.2A1.6 1.6 0 0 1 10.6 5.6h2.8A1.6 1.6 0 0 1 15 7.2v1.2M5.4 12.6h13.2" stroke="var(--da-icon-hole)" strokeWidth="1.5" />
    </>
  )),
  building: icon('#364FC7', () => (
    <>
      <path fill="#fff" d="M6.4 18.4V8.2L12 5.6l5.6 2.6v10.2H6.4Z" />
      <path d="M9.2 10.4h1.4M13.4 10.4h1.4M9.2 13.4h1.4M13.4 13.4h1.4M11.2 18.4v-3h1.6v3" stroke="var(--da-icon-hole)" strokeWidth="1.35" />
    </>
  )),
  rocket: icon('#E8590C', () => (
    <>
      <path fill="#fff" d="M12 4.8c2.4 1.6 4.2 4.6 4.2 7.8 0 1.4-.4 2.6-1 3.6H8.8c-.6-1-1-2.2-1-3.6 0-3.2 1.8-6.2 4.2-7.8Z" />
      <path fill="#fff" d="M8.4 14.8 6.2 18l2.8-1.2M15.6 14.8 17.8 18l-2.8-1.2" />
      <circle cx="12" cy="10.2" r="1.2" fill="var(--da-icon-hole)" />
    </>
  )),
  flask: icon('#12B886', () => (
    <path
      fill="#fff"
      d="M9.4 5.6h5.2v4.2l3.2 6.4A2.4 2.4 0 0 1 15.6 19H8.4A2.4 2.4 0 0 1 6.2 16.2l3.2-6.4V5.6Z"
    />
  )),
  leaf: icon('#2F9E44', () => (
    <>
      <path fill="#fff" d="M18 6.4C12.4 6.2 6.4 10 6.4 16.2c5.8.4 11.2-3.2 11.6-9.8Z" />
      <path d="M9.2 15.6 16.4 8" stroke="var(--da-icon-hole)" strokeWidth="1.5" strokeLinecap="round" />
    </>
  )),
  droplet: icon('#1C7ED6', () => (
    <path fill="#fff" d="M12 5.4S6.8 11.2 6.8 14.4A5.2 5.2 0 0 0 12 19.6a5.2 5.2 0 0 0 5.2-5.2C17.2 11.2 12 5.4 12 5.4Z" />
  )),
  flame: icon('#F76707', () => (
    <path
      fill="#fff"
      d="M12 5.2s2.4 2.8 2.4 5.2c0 1-.4 1.8-1 2.4 1.8-.2 3.6-1.8 3.6-4.2 1.6 1.8 2.2 3.6 2.2 5.4A7.2 7.2 0 0 1 12 20.4 7.2 7.2 0 0 1 4.8 13.6C4.8 10 8.4 7.2 12 5.2Z"
    />
  )),
  moon: icon('#5C7CFA', () => (
    <path fill="#fff" d="M14.8 6.2A6.6 6.6 0 1 0 17.6 15 5.4 5.4 0 0 1 14.8 6.2Z" />
  )),
  sun: icon('#FAB005', () => (
    <>
      <circle cx="12" cy="12" r="3.1" fill="#fff" />
      <path d="M12 5.4v1.6M12 17v1.6M5.4 12h1.6M17 12h1.6M7.2 7.2l1.1 1.1M15.7 15.7l1.1 1.1M16.8 7.2l-1.1 1.1M8.3 15.7 7.2 16.8" {...S} />
    </>
  )),
  crown: icon('#F59F00', () => (
    <path fill="#fff" d="m5.4 15.8 1.6-7.2 3.4 3 1.6-4.4 1.6 4.4 3.4-3 1.6 7.2H5.4ZM6.4 17.4h11.2v1.2H6.4v-1.2Z" />
  )),
  puzzle: icon('#845EF7', () => (
    <path
      fill="#fff"
      d="M8.2 6.4h3.2a1.8 1.8 0 1 1 0 3.2H14a1.6 1.6 0 0 1 1.6 1.6v2.4a1.8 1.8 0 1 1 0 3.2V18a1.6 1.6 0 0 1-1.6 1.6H8.2A1.6 1.6 0 0 1 6.6 18v-3.2a1.8 1.8 0 1 0 0-3.2V8A1.6 1.6 0 0 1 8.2 6.4Z"
    />
  )),
  wand: icon('#BE4BDB', () => (
    <>
      <path d="m8.2 16.8 8.2-8.2" {...S} />
      <path d="M15.4 6.2v2.4M14.2 7.4h2.4M7.2 8.2l.8.8M8 8.2l-.8.8M16.8 14.8l.8.8M17.6 14.8l-.8.8" {...S} />
      <rect x="6.2" y="15.2" width="3.4" height="3.4" rx="0.7" transform="rotate(-45 7.9 16.9)" fill="#fff" />
    </>
  )),
  robot: icon('#495057', () => (
    <>
      <rect x="6.4" y="8" width="11.2" height="9.2" rx="2.2" fill="#fff" />
      <circle cx="9.6" cy="12.2" r="1.05" fill="var(--da-icon-hole)" />
      <circle cx="14.4" cy="12.2" r="1.05" fill="var(--da-icon-hole)" />
      <path d="M10 15h4M12 8V5.8" stroke="var(--da-icon-hole)" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="12" cy="5.4" r="0.85" fill="#fff" />
    </>
  )),
  infinity: icon('#7C3AED', () => (
    <path d="M8.2 9.4a2.8 2.8 0 1 0 0 5.2c1.4 0 2.4-.8 3.8-2.6 1.4 1.8 2.4 2.6 3.8 2.6a2.8 2.8 0 1 0 0-5.2c-1.4 0-2.4.8-3.8 2.6-1.4-1.8-2.4-2.6-3.8-2.6Z" {...S} />
  )),
  at: icon('#1098AD', () => (
    <>
      <circle cx="12" cy="12" r="2.1" {...S} />
      <path d="M14.1 12v1.4a1.6 1.6 0 0 0 1.7 1.6c2.2 0 2.6-2.4 2.6-4 0-3.6-2.8-6.2-6.4-6.2A6.2 6.2 0 1 0 14.8 16" {...S} />
    </>
  )),
  hash: icon('#868E96', () => (
    <path d="m9.2 6.4-1.6 11.2M16.4 6.4 14.8 17.6M5.8 10h12.4M5.4 14.2h12.4" {...S} />
  )),
  plus: icon('#2F9E44', () => (
    <>
      <rect x="5.6" y="5.6" width="12.8" height="12.8" rx="3" fill="#fff" />
      <path d="M12 8.8v6.4M8.8 12h6.4" stroke="var(--da-icon-hole)" strokeWidth="1.8" strokeLinecap="round" />
    </>
  )),
  scan: icon('#15AABF', () => (
    <>
      <path d="M6.4 8.2V6.4H8.4M17.6 8.2V6.4H15.6M6.4 15.8v1.8H8.4M17.6 15.8v1.8H15.6M5.8 12h12.4" {...S} />
    </>
  )),
};
