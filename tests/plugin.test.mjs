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

async function boot(saved, options = {}) {
  const profile = atom('dev');
  const activeId = atom('session-a');
  const applied = [];
  const sessionColors = [];
  const readableInputs = [];
  const writes = [];
  const contributions = [];
  const settings = [];
  const cleanups = [];
  const previews = [];
  const clearedPreviews = [];
  const sessionQueries = [];
  const openedSessions = [];
  let committedThemeChanges = 0;
  let tagCounter = 0;
  let hookValues = [];
  let hookIndex = 0;
  let effectIndex = 0;
  const effectDeps = [];
  const effectCleanups = [];
  const sdk = {
    atom,
    host: {
      state: { profile, focusedStoredSessionId: activeId },
      sessions: { setColor(sessionId, color) { sessionColors.push({ sessionId, color }); } },
      profileRoutes: async () => options.profileRoutes ?? [],
      listPersistedSessions: async (route, query) => {
        sessionQueries.push({ route, query });
        const page = options.sessionPages?.[route.connectionId] ?? { sessions: [], total: 0 };
        if (page instanceof Error) throw page;
        return page;
      },
      openSession: async (sessionId, openOptions) => { openedSessions.push({ sessionId, openOptions }); },
    },
    PALETTE_AREA: 'palette',
    ROUTES_AREA: 'routes',
    SIDEBAR_NAV_AREA: 'sidebar-nav',
    THEMES_AREA: 'themes',
    STATUSBAR_AREAS: { right: 'status-right' },
    SESSION_ROW_AREAS: { trailing: 'session-trailing' },
    Popover: function Popover({ children }) { return children; },
    PopoverTrigger: function PopoverTrigger({ children }) { return children; },
    PopoverContent: function PopoverContent({ children }) { return children; },
    Button: function Button(props) { return { type: 'button', props }; },
    Input: function Input(props) { return { type: 'input', props }; },
    Badge: function Badge(props) { return { type: 'span', props }; },
    Select: function Select({ children, value, onValueChange, ...props }) {
      return { type: 'select', props: { ...props, value, onValueChange, children } };
    },
    SelectTrigger: function SelectTrigger({ children }) { return children; },
    SelectContent: function SelectContent({ children }) { return children; },
    SelectItem: function SelectItem({ children, value }) { return { type: 'option', props: { children, value } }; },
    SelectValue: function SelectValue() { return null; },
    EmptyState: function EmptyState(props) { return { type: 'empty-state', props }; },
    ErrorState: function ErrorState(props) { return { type: 'error-state', props }; },
    ConfirmDialog: function ConfirmDialog(props) { return { type: 'confirm-dialog', props }; },
    setAccentOverride(value) { applied.push(value); },
    readableOn(background) { readableInputs.push(background); return background === '#EFFF00' ? '#000000' : '#FFFFFF'; },
    useTheme() { return { theme: { name: 'midnight-dark', label: 'Midnight', description: 'test', colors: { background: '#101010', foreground: '#eeeeee', sidebarBackground: '#111111', primary: '#777777' }, darkColors: { background: '#090909', foreground: '#eeeeee', sidebarBackground: '#090909', primary: '#777777' } }, themeName: 'midnight', resolvedMode: 'dark', previewTheme(name, mode) { previews.push({ name, mode }); }, clearThemePreview() { clearedPreviews.push(true); }, setTheme() { committedThemeChanges += 1; } }; },
    useValue(value) { return value.get(); },
  };
  const react = {
    useEffect(effect, deps) {
      const index = effectIndex++;
      const previous = effectDeps[index];
      const changed = deps === undefined || !previous || deps.length !== previous.length || deps.some((value, i) => !Object.is(value, previous[i]));
      if (!changed) return;
      effectCleanups[index]?.();
      const cleanup = effect();
      effectDeps[index] = deps;
      if (typeof cleanup === 'function') {
        effectCleanups[index] = cleanup;
        cleanups.push(cleanup);
      }
    },
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
    if (!nested) { hookIndex = 0; effectIndex = 0; }
    if (tree == null) return found;
    if (Array.isArray(tree)) { for (const item of tree) nodes(item, predicate, found, true); return found; }
    if (typeof tree !== 'object' || !('type' in tree)) return found;
    if (typeof tree.type === 'function') { nodes(tree.type(tree.props), predicate, found, true); return found; }
    if (predicate(tree)) found.push(tree);
    nodes(tree.props.children, predicate, found, true);
    return found;
  }
  return { sdk, plugin, profile, activeId, applied, sessionColors, readableInputs, writes, contributions, settings, cleanups, previews, clearedPreviews, sessionQueries, openedSessions, get committedThemeChanges() { return committedThemeChanges; }, find, nodes };
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
  assert.equal(badge[0].props.style.backgroundColor, '#AA334480');

  app.nodes(renderMenu(), (n) => n.props['aria-label'] === 'Clear session tag')[0].props.onClick();
  assert.equal(Object.hasOwn(app.writes.at(-1).value.sessionTags, 'durable-root-1'), false);
  assert.deepEqual(app.sessionColors.at(-1), { sessionId: 'durable-root-1', color: null });
});

test('registers native UI surfaces and applies no override by default', async () => {
  const app = await boot(null);
  assert.equal(app.plugin.id, 'prisma');
  assert.deepEqual(app.contributions.map(({ id }) => id), ['status', 'session-tag', 'reset-profile', 'clear-session', 'tagged-sessions-page', 'tagged-sessions-nav']);
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
  assert.equal(badges[0].props.style.backgroundColor, '#11223380');
});

test('created tags remain visible without an open session', async () => {
  const app = await boot({ tags: { 'tag-1': { name: 'Ready', emoji: '✅', color: '#1E8B4F' } }, sessionTags: {}, sessionEmojis: {} });
  app.activeId.set(null);
  const tags = app.nodes(app.find('status').render(), (n) => n.props['aria-label'] === 'Ready tag');
  assert.equal(tags.length, 1, 'created tags remain visible without an open session');
  assert.equal(tags[0].props.disabled, true);
});

test('session tag badge uses a semi-transparent tag color', async () => {
  const app = await boot({
    tags: { 'tag-1': { name: 'Ready', emoji: '✅', color: '#112233' } },
    sessionTags: { 'durable-session': 'tag-1' },
    sessionEmojis: {},
  });
  const badge = app.nodes(app.find('session-tag').data.render({ sessionId: 'durable-session' }),
    (n) => n.props['aria-label'] === 'Session tag Ready (✅)');
  assert.equal(badge[0].props.style.backgroundColor, '#11223380');
  assert.deepEqual(app.sessionColors.at(-1), { sessionId: 'durable-session', color: '#112233' });
});

test('tag picker uses a translucent fill, no borders, spacing, and readable text', async () => {
  const app = await boot({
    tags: { bright: { name: 'Bright', emoji: '☀️', color: '#EFFF00' } },
    sessionTags: {},
    sessionEmojis: {},
  });
  const menu = app.find('status').render();
  const choice = app.nodes(menu, (n) => n.props['aria-label'] === 'Assign Bright tag to session')[0];
  assert.equal(choice.props.style.backgroundColor, '#EFFF0040');
  assert.equal(choice.props.style.color, '#FFFFFF');
  assert.equal(app.readableInputs.at(-1), '#484C0C');
  assert.doesNotMatch(choice.props.className, /\bborder\b|border-/);
  const list = app.nodes(menu, (n) => n.props.className?.includes('max-h-36'))[0];
  assert.match(list.props.className, /\bgap-1\b/);
});

test('edit tag updates definition and session colors', async () => {
  const app = await boot({
    tags: { 'tag-1': { name: 'Bug', emoji: '🐛', color: '#AA3344' } },
    sessionTags: { 'session-1': 'tag-1', 'session-2': 'tag-1' },
    sessionEmojis: { 'legacy-session': '🐱' },
  });
  const menu = () => app.find('status').render();
  app.nodes(menu(), (n) => n.props['aria-label'] === 'Edit tag Bug')[0].props.onClick();
  const field = (label) => app.nodes(menu(), (n) => n.props['aria-label'] === label)[0];
  assert.equal(field('Tag name').props.value, 'Bug');
  field('Tag name').props.onChange({ target: { value: 'Fixed' } });
  field('Tag emoji').props.onChange({ target: { value: '✅' } });
  field('Tag color').props.onChange({ target: { value: '#196D31' } });
  app.nodes(menu(), (n) => n.props['aria-label'] === 'Save tag')[0].props.onClick();

  const updated = app.writes.at(-1).value;
  assert.deepEqual(updated.tags['tag-1'], { name: 'Fixed', emoji: '✅', color: '#196D31' });
  assert.equal(updated.sessionTags['session-1'], 'tag-1');
  assert.equal(updated.sessionTags['session-2'], 'tag-1');
  assert.equal(Object.keys(updated.sessionTags).length, 2);
  assert.equal(updated.sessionEmojis['legacy-session'], '🐱');
  assert.deepEqual(app.sessionColors.slice(-2), [
    { sessionId: 'session-1', color: '#196D31' },
    { sessionId: 'session-2', color: '#196D31' },
  ]);
});

test('delete confirmation clears all tag assignments and overrides', async () => {
  const app = await boot({
    tags: {
      'tag-1': { name: 'Bug', emoji: '🐛', color: '#AA3344' },
      'tag-2': { name: 'Done', emoji: '✅', color: '#196D31' },
    },
    sessionTags: { 'session-1': 'tag-1', 'session-2': 'tag-1', 'session-3': 'tag-2' },
    sessionEmojis: { 'legacy-session': '🐱' },
  });
  const menu = () => app.find('status').render();
  const deleteTag = () => app.nodes(menu(), (n) => n.props['aria-label'] === 'Delete tag Bug')[0];
  deleteTag().props.onClick();
  let dialog = app.nodes(menu(), (n) => n.type === 'confirm-dialog')[0];
  assert.equal(dialog.props.open, true);
  assert.equal(dialog.props.destructive, true);
  assert.match(dialog.props.description, /2 assigned sessions/);
  assert.equal(app.writes.length, 0, 'deletion waits for confirmation');
  dialog.props.onClose();
  assert.equal(app.writes.length, 0, 'cancel leaves tags unchanged');

  deleteTag().props.onClick();
  dialog = app.nodes(menu(), (n) => n.type === 'confirm-dialog')[0];
  dialog.props.onConfirm();
  const updated = app.writes.at(-1).value;
  assert.deepEqual(Object.keys(updated.tags), ['tag-2']);
  assert.equal(updated.tags['tag-2'].name, 'Done');
  assert.equal(updated.tags['tag-2'].emoji, '✅');
  assert.equal(updated.tags['tag-2'].color, '#196D31');
  assert.deepEqual(Object.keys(updated.sessionTags), ['session-3']);
  assert.equal(updated.sessionTags['session-3'], 'tag-2');
  assert.equal(updated.sessionEmojis['legacy-session'], '🐱');
  assert.deepEqual(app.sessionColors.slice(-2), [
    { sessionId: 'session-1', color: null },
    { sessionId: 'session-2', color: null },
  ]);
});

const localRoute = { connectionId: 'local', mode: 'local', profile: 'dev', targetProfile: 'dev' };
const remoteRoute = { connectionId: 'remote-1', mode: 'remote', profile: 'writer', targetProfile: 'writer' };

function taggedPageNodes(app) {
  const page = app.find('tagged-sessions-page');
  assert.ok(page, 'Prisma registers a tagged sessions page');
  return app.nodes(page.render(), () => true);
}

async function loadTaggedPage(app) {
  taggedPageNodes(app);
  await new Promise((resolve) => setImmediate(resolve));
  return taggedPageNodes(app);
}

test('archived and unresolved tagged sessions are hidden from the board', async () => {
  const app = await boot({
    tags: { bug: { name: 'Bug', emoji: '🐛', color: '#AA3344' } },
    sessionTags: { active: 'bug', archived: 'bug', missing: 'bug' },
    sessionEmojis: {},
  }, {
    profileRoutes: [localRoute],
    sessionPages: {
      local: { sessions: [
        { id: 'active', title: 'Active issue', archived: false },
        { id: 'archived', title: 'Archived issue', archived: true },
      ], total: 2 },
    },
  });
  const nodes = await loadTaggedPage(app);
  assert.equal(nodes.some((node) => node.props['aria-label'] === 'Open tagged session Active issue'), true);
  assert.equal(nodes.some((node) => node.props['aria-label'] === 'Open tagged session Archived issue'), false);
  assert.equal(nodes.some((node) => node.props['aria-label'] === 'Tagged session unavailable: missing'), false);
});

test('sidebar panel lists tagged sessions across profiles', async () => {
  const app = await boot({
    tags: {
      bug: { name: 'Bug', emoji: '🐛', color: '#AA3344' },
      done: { name: 'Done', emoji: '✅', color: '#196D31' },
    },
    sessionTags: {
      'local-session': 'bug',
      'remote-session': 'done',
      'missing-session': 'bug',
      'offline-session': 'done',
    },
    sessionEmojis: {},
  }, {
    profileRoutes: [localRoute, remoteRoute, { connectionId: 'offline', mode: 'remote', profile: 'offline', targetProfile: 'offline' }],
    sessionPages: {
      local: { sessions: [{ id: 'local-session', title: 'Local issue', preview: 'Login failure' }], total: 601 },
      'remote-1': { sessions: [{ id: 'remote-session', title: 'Remote idea', preview: 'Design review' }], total: 1 },
      offline: new Error('gateway unavailable'),
    },
  });
  const navigation = app.find('tagged-sessions-nav');
  assert.ok(navigation, 'Prisma registers sidebar navigation for tagged sessions');
  assert.equal(navigation.area, 'sidebar-nav');
  assert.equal(navigation.data.path, '/prisma/tagged-sessions');
  assert.equal(navigation.data.label, 'Tagged sessions');
  assert.equal(app.find('tagged-sessions-page').area, 'routes');

  const nodes = await loadTaggedPage(app);
  assert.equal(app.sessionQueries.length, 3, 'every registered profile route is queried');
  assert.equal(app.sessionQueries.every(({ query }) => query.limit === 500), true);
  assert.deepEqual(app.sessionQueries.map(({ query }) => query.profile).sort(), ['dev', 'offline', 'writer']);
  assert.equal(nodes.some((node) => node.props['aria-label'] === 'Open tagged session Local issue'), true);
  assert.equal(nodes.some((node) => node.props['aria-label'] === 'Open tagged session Remote idea'), true);
  assert.equal(nodes.some((node) => node.props['aria-label'] === 'Tagged session unavailable: missing-session'), false);
  assert.equal(nodes.some((node) => node.props['aria-label'] === 'Tagged session unavailable: offline-session'), false);
  assert.equal(nodes.some((node) => node.props.role === 'alert'), true, 'a failed profile remains visible');
  assert.equal(nodes.some((node) => String(node.props.children).includes('incomplete')), true, 'large profile lists disclose partial details');

  const openLocal = nodes.find((node) => node.props['aria-label'] === 'Open tagged session Local issue');
  await openLocal.props.onClick();
  assert.equal(app.openedSessions.at(-1).sessionId, 'local-session');
  assert.equal(app.openedSessions.at(-1).openOptions.route.connectionId, 'local');
  assert.equal(app.openedSessions.at(-1).openOptions.route.targetProfile, 'dev');
});

test('tag columns group sessions across profiles', async () => {
  const app = await boot({
    tags: { bug: { name: 'Bug', emoji: '🐛', color: '#AA3344' }, done: { name: 'Done', emoji: '✅', color: '#196D31' } },
    sessionTags: { one: 'bug', two: 'bug', lost: 'done' }, sessionEmojis: {},
  }, {
    profileRoutes: [localRoute, remoteRoute],
    sessionPages: {
      local: { sessions: [{ id: 'one', title: 'First' }], total: 1 },
      'remote-1': { sessions: [{ id: 'two', title: 'Second' }], total: 1 },
    },
  });
  const nodes = await loadTaggedPage(app);
  const bug = nodes.find((node) => node.type === 'section' && node.props['aria-label'] === 'Bug tag column');
  const done = nodes.find((node) => node.type === 'section' && node.props['aria-label'] === 'Done tag column');
  assert.ok(bug && done, 'tag columns exist');
  const bugNodes = app.nodes(bug, () => true);
  const doneNodes = app.nodes(done, () => true);
  assert.ok(bugNodes.some((node) => node.props['aria-label'] === 'Open tagged session First'));
  assert.ok(bugNodes.some((node) => node.props['aria-label'] === 'Open tagged session Second'));
  assert.ok(bugNodes.some((node) => node.props.children === 'dev'));
  assert.ok(bugNodes.some((node) => node.props.children === 'writer'));
  assert.ok(!doneNodes.some((node) => node.props['aria-label'] === 'Tagged session unavailable: lost'));
  assert.ok(!bugNodes.some((node) => node.props['aria-label'] === 'Tagged session unavailable: lost'));
});

test('drag sessions between tag columns', async () => {
  const app = await boot({ tags: { bug: { name: 'Bug', emoji: '🐛', color: '#AA3344' }, done: { name: 'Done', emoji: '✅', color: '#196D31' } }, sessionTags: { root: 'bug', other: 'bug' } }, {
    profileRoutes: [localRoute], sessionPages: { local: { sessions: [{ id: 'rotated', _lineage_root_id: 'root', title: 'First' }, { id: 'other', title: 'Other' }], total: 2 } },
  });
  let nodes = await loadTaggedPage(app);
  const card = nodes.find((n) => n.props['aria-label'] === 'Move session First');
  const target = nodes.find((n) => n.props['aria-label'] === 'Done tag column');
  assert.ok(card && target && card.props.draggable && target.props.onDrop, 'drag controls exist');
  const transfer = { data: {}, setData(type, value) { this.data[type] = value; }, getData(type) { return this.data[type] || ''; } };
  card.props.onDragStart({ dataTransfer: transfer, stopPropagation() {} });
  target.props.onDrop({ dataTransfer: transfer, preventDefault() {}, stopPropagation() {} });
  assert.equal(app.writes.at(-1).value.sessionTags.root, 'done');
  assert.equal(app.writes.at(-1).value.sessionTags.other, 'bug');
  assert.deepEqual(app.sessionColors.at(-1), { sessionId: 'root', color: '#196D31' });
  nodes = await loadTaggedPage(app);
  const menu = nodes.find((n) => n.props['aria-label'] === 'Change tag for Other');
  assert.ok(menu, 'keyboard accessible move control exists');
  menu.props.onValueChange('done');
  assert.equal(app.writes.at(-1).value.sessionTags.other, 'done');
});

test('reorder tag columns persistently', async () => {
  const saved = { tags: { bug: { name: 'Bug', emoji: '🐛', color: '#AA3344' }, done: { name: 'Done', emoji: '✅', color: '#196D31' } }, sessionTags: { one: 'bug' } };
  const options = { profileRoutes: [localRoute], sessionPages: { local: { sessions: [{ id: 'one', title: 'First' }], total: 1 } } };
  const app = await boot(saved, options);
  let nodes = await loadTaggedPage(app);
  const handle = nodes.find((n) => n.props['aria-label'] === 'Drag Bug column');
  const target = nodes.find((n) => n.props['aria-label'] === 'Done tag column');
  assert.ok(handle && handle.props.draggable && target.props.onDrop, 'column drag controls exist');
  const transfer = { data: {}, setData(type, value) { this.data[type] = value; }, getData(type) { return this.data[type] || ''; } };
  handle.props.onDragStart({ dataTransfer: transfer, stopPropagation() {} });
  target.props.onDrop({ dataTransfer: transfer, preventDefault() {}, stopPropagation() {} });
  assert.deepEqual(Array.from(app.writes.at(-1).value.tagOrder), ['done', 'bug']);
  const restored = await boot(app.writes.at(-1).value, options);
  nodes = await loadTaggedPage(restored);
  assert.deepEqual(nodes.filter((n) => n.type === 'section' && /tag column$/.test(n.props['aria-label'] || '')).map((n) => n.props['aria-label']), ['Done tag column', 'Bug tag column']);
  const left = nodes.find((n) => n.props['aria-label'] === 'Move Bug column left');
  assert.ok(left, 'keyboard accessible reorder control exists');
  left.props.onClick();
  assert.deepEqual(Array.from(restored.writes.at(-1).value.tagOrder), ['bug', 'done']);
});

test('tagged sessions can be filtered by profile and tag, searched, and opened', async () => {
  const app = await boot({
    tags: {
      bug: { name: 'Bug', emoji: '🐛', color: '#AA3344' },
      done: { name: 'Done', emoji: '✅', color: '#196D31' },
    },
    sessionTags: { 'local-session': 'bug', 'remote-session': 'done' },
    sessionEmojis: {},
  }, {
    profileRoutes: [localRoute, remoteRoute],
    sessionPages: {
      local: { sessions: [{ id: 'local-session', title: 'Local issue', preview: 'Login failure' }], total: 1 },
      'remote-1': { sessions: [{ id: 'remote-session', title: 'Remote idea', preview: 'Design review' }], total: 1 },
    },
  });
  let nodes = await loadTaggedPage(app);
  const profile = nodes.find((node) => node.type === 'select' && node.props['aria-label'] === 'Profile filter');
  const tag = nodes.find((node) => node.type === 'select' && node.props['aria-label'] === 'Tag filter');
  const search = nodes.find((node) => node.type === 'input' && node.props['aria-label'] === 'Search tagged sessions');
  const remoteOption = nodes.find((node) => node.type === 'option' && node.props.children === 'writer');
  const doneOption = nodes.find((node) => node.type === 'option' && node.props.children === 'Done');
  assert.ok(profile && tag && search && remoteOption && doneOption);

  profile.props.onValueChange(remoteOption.props.value);
  tag.props.onValueChange('all');
  search.props.onChange({ target: { value: 'Remote' } });
  nodes = taggedPageNodes(app);
  assert.equal(nodes.some((node) => node.props['aria-label'] === 'Open tagged session Remote idea'), true);
  assert.equal(nodes.some((node) => node.props['aria-label'] === 'Open tagged session Local issue'), false);

  const currentTag = nodes.find((node) => node.type === 'select' && node.props['aria-label'] === 'Tag filter');
  currentTag.props.onValueChange(doneOption.props.value);
  nodes = taggedPageNodes(app);
  assert.equal(nodes.some((node) => node.props['aria-label'] === 'Open tagged session Remote idea'), true);

  const currentSearch = nodes.find((node) => node.type === 'input' && node.props['aria-label'] === 'Search tagged sessions');
  currentSearch.props.onChange({ target: { value: 'no-match' } });
  nodes = taggedPageNodes(app);
  assert.equal(nodes.some((node) => node.type === 'empty-state' && node.props.title === 'No matching sessions'), true);
});

test('README cover image and PNG asset', () => {
  const readme = fs.readFileSync(path.resolve(cwd, '../README.md'), 'utf8');
  assert.ok(readme.includes('![Prisma plugin cover](assets/prisma-cover.png)'), 'README embeds the repository-relative cover');
  const image = fs.readFileSync(path.resolve(cwd, '../assets/prisma-cover.png'));
  assert.deepEqual([...image.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
});
