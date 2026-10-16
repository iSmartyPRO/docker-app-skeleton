import { test } from 'node:test';
import assert from 'node:assert/strict';

/*
 * Themes: WCAG contrast maths, every theme's token set passing AA, theme
 * choice under the administrator's rules, motion gating, and the server's
 * catalogue / sanitizers staying in step with the frontend.
 */

const contrast = await import('../../frontend/src/theme/contrast.js');
const themes = await import('../../frontend/src/theme/themes.js');
const { THEME_TEMPLATES } = await import('../../frontend/src/theme/templates.js');
const catalog = await import('../services/themeCatalog.js');

test('contrast ratio matches WCAG reference values', () => {
  assert.equal(Math.round(contrast.contrastRatio('#000000', '#FFFFFF') * 100) / 100, 21);
  assert.equal(contrast.contrastRatio('#777777', '#777777'), 1);
  // #767676 on white is the classic 4.54:1 grey.
  assert.ok(Math.abs(contrast.contrastRatio('#767676', '#FFFFFF') - 4.54) < 0.01);
  assert.equal(contrast.contrastRatio('#FFF', '#000'), contrast.contrastRatio('#000', '#FFF'));
  assert.equal(contrast.parseHex('nope'), null);
  assert.equal(contrast.mix('#000000', '#FFFFFF', 0.5), '#808080');
  // A translucent foreground is blended over its background first.
  assert.ok(Math.abs(contrast.contrastRatio('#00000080', '#FFFFFF') - 3.98) < 0.05);
});

test('ensureContrast moves a colour until it reaches the ratio, keeping good ones', () => {
  const yellow = contrast.ensureContrast('#FFE14D', ['#FFFFFF'], 4.5);
  assert.ok(contrast.contrastRatio(yellow, '#FFFFFF') >= 4.5);
  assert.equal(contrast.ensureContrast('#1E3A6E', ['#FFFFFF'], 4.5), '#1E3A6E');
  const navyOnDark = contrast.ensureContrast('#1E3A6E', ['#121A2A'], 4.5);
  assert.ok(contrast.contrastRatio(navyOnDark, '#121A2A') >= 4.5);
  assert.equal(contrast.bestOn('#0A6A86'), '#FFFFFF');
  assert.equal(contrast.bestOn('#FFD60A', ['#FFFFFF', '#000000']), '#000000');
});

test('every theme and every brand template passes WCAG AA', () => {
  const brand = (id) => (scheme) => ({ ...THEME_TEMPLATES[id][scheme] });
  const sets = [];
  for (const theme of themes.THEMES) {
    if (theme.kind === 'palette' || theme.kind === 'dynamic') sets.push([theme.id, themes.themeTokens(theme, theme.scheme, brand('navy'))]);
  }
  for (const id of Object.keys(THEME_TEMPLATES)) {
    for (const scheme of ['light', 'dark']) sets.push([`${scheme}/${id}`, themes.themeTokens(themes.themeById(scheme), scheme, brand(id))]);
  }
  const custom = themes.themeById('custom');
  for (const accent of ['#FFE14D', '#00FF00', '#1E3A6E', '#FF00FF']) {
    for (const scheme of ['light', 'dark']) sets.push([`custom/${scheme}/${accent}`, themes.themeTokens(custom, scheme, brand('navy'), { accent })]);
  }
  for (const [name, colors] of sets) {
    const bad = contrast.checkThemeContrast(colors).filter((pair) => !pair.ok);
    assert.deepEqual(bad, [], `${name}: ${bad.map((p) => `${p.name} ${p.ratio}`).join(', ')}`);
  }
  assert.ok(themes.THEMES.filter((t) => t.kind === 'palette').length >= 6);
  assert.ok(themes.THEMES.filter((t) => t.kind === 'dynamic').length >= 2);
});

test('pickTheme follows device → person → portal default under the rules', () => {
  const all = themes.themePolicy({});
  assert.equal(themes.pickTheme({ userTheme: 'ocean', policy: all }).id, 'ocean');
  assert.equal(themes.pickTheme({ manual: 'midnight', userTheme: 'ocean', policy: all }).scheme, 'dark');
  const some = themes.themePolicy({ themes: { allowed: ['sand'], allowCustom: false } });
  assert.equal(themes.pickTheme({ userTheme: 'ocean', portalDefault: 'sand', policy: some }).id, 'sand');
  assert.equal(themes.pickTheme({ userTheme: 'ocean', portalDefault: 'forest', policy: some }).id, 'forest', 'the portal default is always allowed');
  assert.equal(themes.pickTheme({ userTheme: 'system', policy: some, systemDark: true }).scheme, 'dark');
  assert.equal(themes.pickTheme({ userTheme: 'custom', policy: all, hasCustom: false }).id, 'light');
  assert.equal(themes.pickTheme({ userTheme: 'custom', policy: all, hasCustom: true }).id, 'custom');
  assert.equal(themes.pickTheme({ userTheme: 'custom', policy: some, hasCustom: true }).id, 'light');
  assert.equal(themes.pickTheme({ userTheme: 'nonsense', policy: all }).id, 'light');
});

test('motion is off under reduced motion, the switch, policy, data saver and weak devices', () => {
  assert.equal(themes.motionAllowed({ cores: 8, memory: 8 }), true);
  assert.equal(themes.motionAllowed({ reducedMotion: true }), false);
  assert.equal(themes.motionAllowed({ userMotion: 'off' }), false);
  assert.equal(themes.motionAllowed({ policyMotion: false }), false);
  assert.equal(themes.motionAllowed({ saveData: true }), false);
  assert.equal(themes.motionAllowed({ cores: 2 }), false);
  assert.equal(themes.motionAllowed({ memory: 1 }), false);
});

test('server catalogue matches the frontend theme list', () => {
  assert.deepEqual(catalog.THEME_IDS, themes.THEME_IDS);
  assert.deepEqual(catalog.OPTIONAL_THEME_IDS, themes.OPTIONAL_THEME_IDS);
  assert.ok(catalog.THEME_IDS.every((id) => id.length <= 16), 'fits users.theme VARCHAR(16)');
});

test('theme policy and user ui sanitizers', () => {
  assert.deepEqual(catalog.sanitizeThemePolicy({ allowed: ['ocean', 'light', 'evil', 'ocean'], allowCustom: false }), { allowed: ['ocean'], allowCustom: false, allowMotion: true });
  assert.equal(catalog.sanitizeDefaultTheme('custom'), 'light');
  assert.equal(catalog.sanitizeDefaultTheme('borealis'), 'borealis');
  const ui = catalog.sanitizeUserUi({ motion: 'off', toursOff: true, custom: { image: 'a'.repeat(24), accent: '#abcdef', scheme: 'dark', dim: 5, blur: 99, extra: 1 }, junk: 1 });
  assert.deepEqual(ui, { motion: 'off', toursOff: true, custom: { image: 'a'.repeat(24), accent: '#ABCDEF', scheme: 'dark', dim: 60, blur: 24 } });
  const kept = catalog.sanitizeUserUi({ custom: { dim: 80 } }, ui);
  assert.equal(kept.custom.image, 'a'.repeat(24));
  assert.equal(kept.custom.dim, 80);
  assert.equal(catalog.sanitizeUserUi({ custom: { image: null } }, ui).custom.image, null);
  assert.equal(catalog.sanitizeUserUi({ custom: { image: '../../etc/passwd' } }, {}).custom.image, null);
  assert.deepEqual(catalog.sanitizeStoredUi(null), { motion: 'auto', toursOff: false });
  // The frontend reads the same shape.
  assert.deepEqual(themes.cleanCustom(ui.custom), ui.custom);
});

test('the server accepts only themes the administrator offers, like the frontend', () => {
  const policy = { allowed: ['ocean'], allowCustom: false };
  assert.equal(catalog.themeAllowed('dark', policy, 'light'), true, 'base themes always');
  assert.equal(catalog.themeAllowed('ocean', policy, 'light'), true);
  assert.equal(catalog.themeAllowed('forest', policy, 'light'), false);
  assert.equal(catalog.themeAllowed('forest', policy, 'forest'), true, 'the portal default always');
  assert.equal(catalog.themeAllowed('custom', policy, 'light'), false, 'custom off');
  assert.equal(catalog.themeAllowed('custom', {}, 'light'), true);
  assert.equal(catalog.themeAllowed('nope', {}, 'light'), false);
  for (const id of catalog.THEME_IDS) {
    for (const rules of [policy, {}, { allowed: ['sand', 'midnight'], allowCustom: true }]) {
      const front = themes.isThemeAllowed(id, themes.themePolicy({ themes: rules }), { portalDefault: 'graphite' });
      assert.equal(catalog.themeAllowed(id, rules, 'graphite'), front, `${id} ${JSON.stringify(rules)}`);
    }
  }
});
