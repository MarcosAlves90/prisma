import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const cwd = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.resolve(cwd, '../desktop/plugin.js'), 'utf8');

function atom(initial) {
  let value = initial;
  const listeners = new Set();
  return {
    get: () => value,
    set(next) { value = next; for (const fn of listeners) fn(next); },
    subscribe(fn) { listeners.add(fn); fn(value); return () => listeners.delete(fn); },
  };
}

async function boot(saved) {
  const profile = atom('dev');
  const activeId = atom('session-a');
  const applied = [];
  const writes = [];
  const contributions = [];
  const settings = [];
  const cleanups = [];
  const previews = [];
  const clearedPreviews = [];
  let committedThemeChanges = 0;
  const sdk = {
    atom,
    host: { state: { profile, focusedStoredSessionId: activeId } },
    PALETTE_AREA: 'palette',
    THEMES_AREA: 'themes',
    STATUSBAR_AREAS: { right: 'status-right' },
    SESSION_ROW_AREAS: { trailing: 'session-trailing' },
    Popover: function Popover({ children }) { return children; },
    PopoverTrigger: function PopoverTrigger({ children }) { return children; },
    PopoverContent: function PopoverContent({ children }) { return children; },
    setAccentOverride(value) { applied.push(value); },
    readableOn() { return '#FFFFFF'; },
    useTheme() { return { theme: { name: 'midnight-dark', label: 'Midnight', description: 'test', colors: { background: '#101010', foreground: '#eeeeee', sidebarBackground: '#111111', primary: '#777777' }, darkColors: { background: '#090909', foreground: '#eeeeee', sidebarBackground: '#090909', primary: '#777777' } }, themeName: 'midnight', resolvedMode: 'dark', previewTheme(name, mode) { previews.push({ name, mode }); }, clearThemePreview() { clearedPreviews.push(true); }, setTheme() { committedThemeChanges += 1; } }; },
    useValue(value) { return value.get(); },
  };
  const react = { useEffect(effect) { const cleanup = effect(); if (cleanup) cleanups.push(cleanup); }, useState(value) { return [typeof value === 'function' ? value() : value, () => {}]; } };
  const jsx = (type, props, key) => ({ type, props: props ?? {}, key });
  const jx = { jsx, jsxs: jsx };
  const context = vm.createContext({ Intl, Object, Array, String, RegExp, console });
  const entry = new vm.SourceTextModule(source, { context });
  await entry.link((specifier) => {
    const map = { '@hermes/plugin-sdk': sdk, react, 'react/jsx-runtime': jx };
    assert.ok(map[specifier], `unexpected import: ${specifier}`);
    return new vm.SyntheticModule(Object.keys(map[specifier]), function () {
      for (const [name, value] of Object.entries(map[specifier])) this.setExport(name, value);
    }, { context });
  });
  await entry.evaluate();
  const plugin = entry.namespace.default;
  const ctx = {
    storage: { get(_key, fallback) { return saved ?? fallback; }, set(key, value) { writes.push({ key, value }); } },
    registerMany(items) { contributions.push(...items); },
    register(item) { contributions.push(item); return () => { const index = contributions.indexOf(item); if (index >= 0) contributions.splice(index, 1); }; },
    registerSettingsPage(item) { settings.push(item); },
    onDispose(fn) { cleanups.push(fn); },
  };
  plugin.register(ctx);
  const find = (id) => contributions.find((item) => item.id === id);
  function nodes(tree, predicate, found = []) {
    if (tree == null) return found;
    if (Array.isArray(tree)) { for (const item of tree) nodes(item, predicate, found); return found; }
    if (typeof tree !== 'object' || !('type' in tree)) return found;
    if (typeof tree.type === 'function') { nodes(tree.type(tree.props), predicate, found); return found; }
    if (predicate(tree)) found.push(tree);
    nodes(tree.props.children, predicate, found);
    return found;
  }
  return { sdk, plugin, profile, activeId, applied, writes, contributions, settings, cleanups, previews, clearedPreviews, get committedThemeChanges() { return committedThemeChanges; }, find, nodes };
}

test('registers native UI surfaces and applies no override by default', async () => {
  const app = await boot(null);
  assert.equal(app.plugin.id, 'prisma');
  assert.deepEqual(app.contributions.map(({ id }) => id), ['status', 'session-emoji', 'reset-profile', 'clear-session']);
  assert.equal(app.settings.length, 1);
  assert.equal(app.applied.at(-1), null);
});

test('saved profile colors are isolated and restored on profile switches', async () => {
  const app = await boot({ profileColors: { dev: '#AABBCC', writing: '#4411AA' }, sessionEmojis: {} });
  assert.equal(app.applied.at(-1), '#AABBCC');
  app.profile.set('writing');
  assert.equal(app.applied.at(-1), '#4411AA');
  app.profile.set('unset');
  assert.equal(app.applied.at(-1), null);
  app.profile.set('dev');
  assert.equal(app.applied.at(-1), '#AABBCC');
});

test('accent color also tints Prisma surfaces with a much darker background', async () => {
  const app = await boot({ profileColors: { dev: '#8250DF' }, sessionEmojis: {} });
  const surfaces = app.nodes(app.find('status').render(), (n) => n.props.className?.includes('w-[278px]'));
  assert.equal(surfaces.length, 1);
  assert.equal(surfaces[0].props.style.backgroundColor, '#0A0611');
  app.profile.set('unset');
  const original = app.nodes(app.find('status').render(), (n) => n.props.className?.includes('w-[278px]'));
  assert.equal(original[0].props.style.backgroundColor, undefined);
});

test('accent-derived app-wide background theme', async () => {
  const app = await boot({ profileColors: { dev: '#8250DF' }, sessionEmojis: {} });
  app.nodes(app.find('status').render(), () => false);
  const theme = app.contributions.find((item) => item.area === 'themes');
  assert.ok(theme, 'accent-derived app-wide background theme');
  assert.equal(theme.data.colors.background, '#0A0611');
  assert.equal(theme.data.darkColors.background, '#0A0611');
  assert.equal(theme.data.label, 'Prisma', 'Prisma theme identity');
  assert.match(theme.data.description, /#8250DF.*dev.*Midnight/);
  assert.deepEqual(app.previews, [{ name: theme.data.name, mode: 'dark' }]);
  assert.equal(app.committedThemeChanges, 0);
});

test('changing color through swatch persists only the active profile', async () => {
  const app = await boot(null);
  const tree = app.find('status').render();
  const palette = app.nodes(tree, (n) => n.props['aria-label'] === 'Aplicar cor #8250DF');
  assert.equal(palette.length, 1);
  palette[0].props.onClick();
  assert.equal(app.applied.at(-1), '#8250DF');
  assert.equal(app.writes.at(-1).value.profileColors.dev, '#8250DF');
  app.profile.set('other');
  assert.equal(app.applied.at(-1), null);
  app.find('reset-profile').data.run();
  assert.equal(Object.hasOwn(app.writes.at(-1).value.profileColors, 'dev'), true);
  assert.equal(Object.hasOwn(app.writes.at(-1).value.profileColors, 'other'), false);
});

test('session preset gets stored by durable session id and renders on its row', async () => {
  const app = await boot(null);
  const row = () => app.find('session-emoji').data.render({ sessionId: 'durable-root-1' });
  const applyButtons = app.nodes(row(), (n) => n.props['aria-label'] === 'Concluída');
  assert.equal(applyButtons.length, 1);
  applyButtons[0].props.onClick();
  assert.equal(app.writes.at(-1).value.sessionEmojis['durable-root-1'], '✅');
  const badge = app.nodes(row(), (n) => n.props['aria-label']?.includes('Alterar emoji da sessão'));
  assert.equal(badge.length, 1);
  assert.equal(badge[0].props.children, '✅');
  app.activeId.set('durable-root-1');
  app.find('clear-session').data.run();
  assert.equal(Object.hasOwn(app.writes.at(-1).value.sessionEmojis, 'durable-root-1'), false);
});

test('invalid color and non-emoji text in storage are discarded; teardown restores theme', async () => {
  const app = await boot({ profileColors: { dev: 'javascript:alert(1)' }, sessionEmojis: { 's-1': 'DROP TABLE', 's-2': '🧑🏽‍💻' } });
  assert.equal(app.applied.at(-1), null);
  const row = app.find('session-emoji').data.render({ sessionId: 's-2' });
  const badge = app.nodes(row, (n) => n.props['aria-label']?.includes('Alterar emoji da sessão'));
  assert.equal(badge[0].props.children, '🧑🏽‍💻');
  const badRow = app.find('session-emoji').data.render({ sessionId: 's-1' });
  const blankBadge = app.nodes(badRow, (n) => n.props['aria-label'] === 'Atribuir emoji à sessão');
  assert.equal(blankBadge[0].props.children, '+');
  app.cleanups.forEach((fn) => fn());
  assert.equal(app.applied.at(-1), null);
  app.profile.set('other');
  assert.equal(app.applied.at(-1), null);
});

test('persisted annotations and colors are restored by a new plugin instance', async () => {
  const first = await boot(null);
  const done = first.nodes(first.find('session-emoji').data.render({ sessionId: 'stable-123' }),
    (n) => n.props['aria-label'] === 'Concluída');
  done[0].props.onClick();
  const swatch = first.nodes(first.find('status').render(),
    (n) => n.props['aria-label'] === 'Aplicar cor #196D31');
  swatch[0].props.onClick();
  const lastSaved = first.writes.at(-1).value;
  const second = await boot(lastSaved);
  assert.equal(second.applied.at(-1), '#196D31');
  const badges = second.nodes(second.find('session-emoji').data.render({ sessionId: 'stable-123' }),
    (n) => n.props['aria-label']?.includes('Alterar emoji da sessão'));
  assert.equal(badges[0].props.children, '✅');
});
