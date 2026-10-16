#!/usr/bin/env node
/*
 * WCAG AA contrast check of every theme (theme/themes.js) and of the brand
 * templates under the base light/dark themes (theme/templates.js).
 *
 *   node scripts/check-theme-contrast.mjs          # summary, exit 1 on a failure
 *   node scripts/check-theme-contrast.mjs --all    # every pair of every theme
 *
 * Pairs and minimums: theme/contrast.js → checkThemeContrast.
 */
import { THEMES, themeTokens } from '../src/theme/themes.js';
import { THEME_TEMPLATES } from '../src/theme/templates.js';
import { checkThemeContrast, contrastRatio, mix } from '../src/theme/contrast.js';

const verbose = process.argv.includes('--all');
const brandOf = (templateId) => (scheme) => ({ ...(THEME_TEMPLATES[templateId][scheme] || THEME_TEMPLATES[templateId].light) });

const cases = [];
for (const theme of THEMES) {
  if (theme.kind === 'palette' || theme.kind === 'dynamic') {
    const colors = themeTokens(theme, theme.scheme, brandOf('navy'));
    cases.push({ name: theme.id, colors });
    // Living themes: text sits on the moving layer where no panel covers it; check the strongest tint of it.
    for (const tint of theme.backdrop?.ground === false ? [] : theme.backdrop?.colors || []) {
      const ground = mix(tint, colors.colorBgLayout, theme.backdrop.opacity);
      cases.push({ name: `${theme.id} · backdrop ${tint}`, colors: { ...colors, colorBgLayout: ground }, only: ['text / layout', 'secondary text / layout', 'focus ring / layout'] });
    }
  }
}
for (const templateId of Object.keys(THEME_TEMPLATES)) {
  for (const scheme of ['light', 'dark']) {
    const theme = THEMES.find((item) => item.id === scheme);
    const colors = themeTokens(theme, scheme, brandOf(templateId));
    const source = brandOf(templateId)(scheme);
    const adjusted = ['colorPrimary', 'colorError', 'colorSuccess', 'colorWarning'].filter((key) => source[key].toUpperCase() !== colors[key].toUpperCase()).map((key) => `${key} ${source[key]} → ${colors[key]}`);
    cases.push({ name: `${scheme} · brand ${templateId}`, colors, adjusted });
  }
}
// A custom theme with a hard accent (yellow on light, navy on dark) must still be corrected to AA.
const custom = THEMES.find((item) => item.id === 'custom');
cases.push({ name: 'custom · light · #FFE14D', colors: themeTokens(custom, 'light', brandOf('navy'), { accent: '#FFE14D' }) });
cases.push({ name: 'custom · dark · #1E3A6E', colors: themeTokens(custom, 'dark', brandOf('navy'), { accent: '#1E3A6E' }) });

let failures = 0;
for (const item of cases) {
  const pairs = checkThemeContrast(item.colors).filter((pair) => !item.only || item.only.includes(pair.name));
  const bad = pairs.filter((pair) => !pair.ok);
  failures += bad.length;
  const worstText = Math.min(...pairs.filter((pair) => pair.min >= 4.5).map((pair) => pair.ratio));
  console.log(`${bad.length ? 'FAIL' : 'ok  '}  ${item.name.padEnd(28)} worst AA-text pair ${worstText.toFixed(2)}:1`);
  for (const note of item.adjusted || []) console.log(`        adjusted for AA: ${note}`);
  for (const pair of verbose ? pairs : bad) {
    console.log(`        ${pair.ok ? ' ' : '✗'} ${pair.name.padEnd(30)} ${pair.fg} on ${pair.bg}  ${pair.ratio.toFixed(2)} (min ${pair.min})`);
  }
}
console.log(failures ? `\n${failures} pair(s) below WCAG AA` : `\nAll ${cases.length} themes pass WCAG AA`);
process.exit(failures ? 1 : 0);
