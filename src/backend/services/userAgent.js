/*
 * Small dependency-free user-agent reader for the sessions list: which
 * browser, which system, which kind of device. It only has to be good enough
 * for a person to recognise their own devices, not for analytics.
 *
 * `platformVersion` is the optional Client Hint the frontend sends
 * (navigator.userAgentData): browsers freeze the UA at "Windows NT 10.0" and
 * "Mac OS X 10_15_7", so the real Windows 11 / macOS version only comes from it.
 */

const BROWSERS = [
  // Order matters: Chromium-based browsers also say "Chrome" and "Safari".
  ['Edge', /\b(?:Edg|EdgA|EdgiOS|Edge)\/(\d+)/],
  ['Yandex', /\bYaBrowser\/(\d+)/],
  ['Samsung Internet', /\bSamsungBrowser\/(\d+)/],
  ['Opera', /\b(?:OPR|OPiOS|OPT)\/(\d+)/],
  ['Opera', /\bOpera[/ ](\d+)/],
  ['Firefox', /\b(?:Firefox|FxiOS)\/(\d+)/],
  ['Chrome', /\bCriOS\/(\d+)/],
  ['Chrome', /\bChrome\/(\d+)/],
  ['Safari', /\bVersion\/(\d+(?:\.\d+)?).*\bSafari\//],
];

const WINDOWS_NT = { '10.0': '10', '6.3': '8.1', '6.2': '8', '6.1': '7', '6.0': 'Vista', '5.1': 'XP' };

function dotted(value) {
  return String(value || '').replace(/_/g, '.').replace(/(\.0)+$/, '');
}

function detectBrowser(ua) {
  for (const [name, pattern] of BROWSERS) {
    const match = ua.match(pattern);
    if (match) return { browser: name, browserVersion: match[1] };
  }
  // iOS web views and home-screen apps without "Version/…": still Safari's engine.
  if (/\b(iPhone|iPad|iPod)\b/.test(ua) && /AppleWebKit/.test(ua)) return { browser: 'Safari', browserVersion: null };
  return { browser: null, browserVersion: null };
}

function detectOs(ua, platformVersion) {
  const hint = String(platformVersion || '').trim();
  const hintMajor = Number.parseInt(hint, 10);
  let match;
  if ((match = ua.match(/\b(iPhone|iPod)\b.*?\bOS (\d+(?:_\d+)*)/))) return { os: 'iOS', osVersion: dotted(match[2]) };
  if ((match = ua.match(/\biPad\b.*?\bOS (\d+(?:_\d+)*)/))) return { os: 'iPadOS', osVersion: dotted(match[1]) };
  if ((match = ua.match(/\bAndroid[ /]?(\d+(?:\.\d+)*)?/))) {
    // Reduced Chrome UAs say "Android 10; K" for every version; the hint knows better.
    return { os: 'Android', osVersion: hint && hintMajor > 0 ? dotted(hint) : match[1] ? dotted(match[1]) : null };
  }
  if ((match = ua.match(/\bWindows NT (\d+\.\d+)/))) {
    let version = WINDOWS_NT[match[1]] || null;
    // Client Hint: platformVersion 13+ is Windows 11, 1–12 is Windows 10.
    if (match[1] === '10.0' && hint) version = hintMajor >= 13 ? '11' : hintMajor > 0 ? '10' : version;
    return { os: 'Windows', osVersion: version };
  }
  if (/\bWindows\b/.test(ua)) return { os: 'Windows', osVersion: null };
  if (/\bCrOS\b/.test(ua)) return { os: 'ChromeOS', osVersion: null };
  if ((match = ua.match(/\bMac OS X (\d+(?:[._]\d+)*)/)) || /\bMacintosh\b/.test(ua)) {
    if (hint && hintMajor > 0) return { os: 'macOS', osVersion: dotted(hint) };
    // Every browser now reports 10.15.7 regardless of the real version: not shown.
    const version = match ? dotted(match[1]) : null;
    return { os: 'macOS', osVersion: version && !/^10\.15(\.7)?$/.test(version) ? version : null };
  }
  if (/\bLinux\b/.test(ua)) return { os: 'Linux', osVersion: null };
  return { os: null, osVersion: null };
}

function detectType(ua, os) {
  if (/\biPad\b|\bTablet\b|\bKindle\b|\bSilk\//.test(ua)) return 'tablet';
  if (os === 'Android') return /\bMobile\b/.test(ua) ? 'mobile' : 'tablet';
  if (/\bMobi|\biPhone\b|\biPod\b|\bWindows Phone\b/.test(ua)) return 'mobile';
  return 'desktop';
}

/** → { browser, browserVersion, os, osVersion, type: 'mobile' | 'tablet' | 'desktop' } */
export function parseUserAgent(userAgent, { platformVersion } = {}) {
  const ua = String(userAgent || '').slice(0, 1024);
  const { browser, browserVersion } = detectBrowser(ua);
  const { os, osVersion } = detectOs(ua, platformVersion);
  return { browser, browserVersion, os, osVersion, type: detectType(ua, os) };
}
