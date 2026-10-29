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
  const sessionColors = [];
  const writes = [];
  const contributions = [];
  const settings = [];
  const cleanups = [];
  const previews = [];
  const clearedPreviews = [];
  let committedThemeChanges = 0;
  let tagCounter = 0;
  let hookValues = [];
  let hookIndex = 0;
  const sdk = {
    atom,
    host: {
      state: { profile, focusedStoredSessionId: activeId },
      sessions: { setColor(sessionId, color) { sessionColors.push({ sessionId, color }); } },
    },
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
  const react = {
    useEffect(effect) { const cleanup = effect(); if (cleanup) cleanups.push(cleanup); },
    useState(value) {
      const index = hookIndex++;
      if (!Object.hasOwn(hookValues, index)) hookValues[index] = typeof value === 'function' ? value() : value;
      return [hookValues[index], (next) => { hookValues[index] = typeof next === 'function' ? next(hookValues[index]) : next; }];
    },
  };
  const jsx = (type, props, key) => ({ type, props: props ?? {}, key });
  const jx = { jsx, jsxs: jsx };
  const context = vm.createContext({ Intl, Object, Array, String, RegExp, console, crypto: { randomUUID: () => `tag-${tagCounter++}` } });
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
  function nodes(tree, predicate, found = [], nested = false) {
    if (!nested) hookIndex = 0;
    if (tree == null) return found;
    if (Array.isArray(tree)) { for (const item of tree) nodes(item, predicate, found, true); return found; }
    if (typeof tree !== 'object' || !('type' in tree)) return found;
    if (typeof tree.type === 'function') { nodes(tree.type(tree.props), predicate, found, true); return found; }
    if (predicate(tree)) found.push(tree);
    nodes(tree.props.children, predicate, found, true);
    return found;
  }
  return { sdk, plugin, profile, activeId, applied, sessionColors, writes, contributions, settings, cleanups, previews, clearedPreviews, get committedThemeChanges() { return committedThemeChanges; }, find, nodes };
}

test('Prisma supports creating and applying named session tags', async () => {
  const app = await boot(null);
  app.activeId.set('durable-root-1');
  const renderMenu = () => app.find('status').render();
  const nameInput = () => app.nodes(renderMenu(), (n) => n.props['aria-label'] === 'Tag name');
  assert.equal(nameInput().length, 1, 'Prisma supports creating and applying named session tags');
  nameInput()[0].props.onChange({ target: { value: 'Bug' } });
  app.nodes(renderMenu(), (n) => n.props['aria-label'] === 'Tag emoji')[0].props.onChange({ target: { value: '🐛' } });
  app.nodes(renderMenu(), (n) => n.props['aria-label'] === 'Tag color')[0].props.onChange({ target: { value: '#AA3344' } });
  app.nodes(renderMenu(), (n) => n.props['aria-label'] === 'Create tag')[0].props.onClick();

  const saved = app.writes.at(-1).value;
  const [tagId] = Object.keys(saved.tags);
  assert.deepEqual(saved.tags[tagId], { name: 'Bug', emoji: '🐛', color: '#AA3344' });
  app.nodes(renderMenu(), (n) => n.props['aria-label'] === 'Assign Bug tag to session')[0].props.onClick();
  assert.equal(app.writes.at(-1).value.sessionTags['durable-root-1'], tagId);
  assert.deepEqual(app.sessionColors.at(-1), { sessionId: 'durable-root-1', color: '#AA3344' });

  const row = () => app.find('session-tag').data.render({ sessionId: 'durable-root-1' });
  const badge = app.nodes(row(), (n) => n.props['aria-label'] === 'Session tag Bug (🐛)');
  assert.equal(badge[0].props.children, '🐛');
  assert.equal(badge[0].props.style.backgroundColor, '#AA3344');

  app.nodes(renderMenu(), (n) => n.props['aria-label'] === 'Clear session tag')[0].props.onClick();
  assert.equal(Object.hasOwn(app.writes.at(-1).value.sessionTags, 'durable-root-1'), false);
  assert.deepEqual(app.sessionColors.at(-1), { sessionId: 'durable-root-1', color: null });
});

test('registers native UI surfaces and applies no override by default', async () => {
  const app = await boot(null);
  assert.equal(app.plugin.id, 'prisma');
  assert.deepEqual(app.contributions.map(({ id }) => id), ['status', 'session-tag', 'reset-profile', 'clear-session']);
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
  assert.equal(theme.data.description, 'Darkened #8250DF background for profile dev, based on Midnight.');
  assert.deepEqual(app.previews, [{ name: theme.data.name, mode: 'dark' }]);
  assert.equal(app.committedThemeChanges, 0);
});

test('changing color through swatch persists only the active profile', async () => {
  const app = await boot(null);
  const tree = app.find('status').render();
  const palette = app.nodes(tree, (n) => n.props['aria-label'] === 'Apply color #8250DF');
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

test('invalid stored tags are discarded and legacy emojis remain visible until cleared', async () => {
  const app = await boot({ profileColors: { dev: 'javascript:alert(1)' }, sessionEmojis: { 's-1': 'DROP TABLE', 's-2': '🧑🏽‍💻' } });
  assert.equal(app.applied.at(-1), null);
  const row = app.find('session-tag').data.render({ sessionId: 's-2' });
  const badge = app.nodes(row, (n) => n.props['aria-label'] === 'Legacy session emoji (🧑🏽‍💻)');
  assert.equal(badge[0].props.children, '🧑🏽‍💻');
  assert.equal(badge[0].props.style.backgroundColor, undefined);
  const badRow = app.find('session-tag').data.render({ sessionId: 's-1' });
  const blankBadge = app.nodes(badRow, (n) => n.props['aria-label'] === 'Assign a session tag');
  assert.equal(blankBadge[0].props.children, '+');
  assert.equal(app.sessionColors.length, 0);
  app.cleanups.forEach((fn) => fn());
  assert.equal(app.applied.at(-1), null);
  assert.equal(app.sessionColors.length, 0);
  app.profile.set('other');
  assert.equal(app.applied.at(-1), null);
});

test('persisted tags and colors are restored by a new plugin instance', async () => {
  const saved = {
    profileColors: { dev: '#196D31' },
    tags: { 'tag-1': { name: 'Done', emoji: '✅', color: '#112233' } },
    sessionTags: { 'stable-123': 'tag-1' },
    sessionEmojis: {},
  };
  const app = await boot(saved);
  assert.equal(app.applied.at(-1), '#196D31');
  assert.deepEqual(app.sessionColors.at(-1), { sessionId: 'stable-123', color: '#112233' });
  const badges = app.nodes(app.find('session-tag').data.render({ sessionId: 'stable-123' }),
    (n) => n.props['aria-label'] === 'Session tag Done (✅)');
  assert.equal(badges[0].props.children, '✅');
  assert.equal(badges[0].props.style.backgroundColor, '#112233');
});
