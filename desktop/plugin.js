/**
 * Prisma — persistent profile accents and colored session tags for Hermes Desktop.
 * Disk plugin: the Hermes Desktop loader resolves @hermes/plugin-sdk and react/jsx-runtime.
 * No DOM scraping, no network access, and no agent/gateway actions.
 */
import {
  atom,
  Badge,
  Button,
  EmptyState,
  ErrorState,
  host,
  Input,
  PALETTE_AREA,
  Popover,
  PopoverContent,
  PopoverTrigger,
  ConfirmDialog,
  readableOn,
  ROUTES_AREA,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SESSION_ROW_AREAS,
  SIDEBAR_NAV_AREA,
  setAccentOverride,
  STATUSBAR_AREAS,
  THEMES_AREA,
  useTheme,
  useValue,
} from '@hermes/plugin-sdk';
import { useEffect, useState } from 'react';
import { jsx, jsxs } from 'react/jsx-runtime';

const VERSION = 2;
const FALLBACK_COLOR = '#4A84FE';
const TAG_FILL_ALPHA = 0x40;
const COLORS = ['#4A84FE', '#8250DF', '#BF3989', '#196D31', '#BC4C00', '#0E7490', '#E11D48', '#EAB308', '#64748B', '#14B8A6'];

const record = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const validColor = (value) => typeof value === 'string' && /^#[\da-f]{6}$/i.test(value);
const normColor = (value) => validColor(value) ? value.toUpperCase() : null;
const darkColor = (value) => {
  const color = normColor(value);
  return color ? `#${[1, 3, 5].map((index) => Math.floor(parseInt(color.slice(index, index + 2), 16) * 0.08).toString(16).padStart(2, '0')).join('')}`.toUpperCase() : null;
};
const compositeColor = (color, surface) => {
  const foreground = normColor(color);
  const background = normColor(surface);
  if (!foreground || !background) return foreground ?? FALLBACK_COLOR;
  return `#${[1, 3, 5].map((index) => {
    const front = parseInt(foreground.slice(index, index + 2), 16);
    const back = parseInt(background.slice(index, index + 2), 16);
    return Math.round((front * TAG_FILL_ALPHA + back * (0xff - TAG_FILL_ALPHA)) / 0xff).toString(16).padStart(2, '0');
  }).join('')}`.toUpperCase();
};
const profileId = (value) => typeof value === 'string' && value.length ? value : 'default';

function normEmoji(value) {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text || text.length > 32) return null;
  const count = typeof Intl.Segmenter === 'function'
    ? [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)].length
    : null;
  if (count !== null && count !== 1) return null;
  if (!/[\p{Extended_Pictographic}\p{Regional_Indicator}\u20E3]/u.test(text)) return null;
  return text;
}

function cleanPrefs(input) {
  const profileColors = {};
  const tags = {};
  const sessionTags = {};
  const sessionEmojis = {};
  if (record(input) && record(input.profileColors)) {
    for (const [key, value] of Object.entries(input.profileColors)) {
      const color = normColor(value);
      if (color) Object.defineProperty(profileColors, key, { value: color, enumerable: true, configurable: true, writable: true });
    }
  }
  if (record(input) && record(input.tags)) {
    for (const [id, value] of Object.entries(input.tags)) {
      const name = record(value) && typeof value.name === 'string' ? value.name.trim() : '';
      const emoji = record(value) ? normEmoji(value.emoji) : null;
      const color = record(value) ? normColor(value.color) : null;
      if (id && id.length <= 128 && name && name.length <= 40 && emoji && color) {
        Object.defineProperty(tags, id, { value: { name, emoji, color }, enumerable: true, configurable: true, writable: true });
      }
    }
  }
  if (record(input) && record(input.sessionTags)) {
    for (const [sessionId, tagId] of Object.entries(input.sessionTags)) {
      if (sessionId && typeof tagId === 'string' && Object.hasOwn(tags, tagId)) {
        Object.defineProperty(sessionTags, sessionId, { value: tagId, enumerable: true, configurable: true, writable: true });
      }
    }
  }
  if (record(input) && record(input.sessionEmojis)) {
    for (const [key, value] of Object.entries(input.sessionEmojis)) {
      const emoji = normEmoji(value);
      if (emoji) Object.defineProperty(sessionEmojis, key, { value: emoji, enumerable: true, configurable: true, writable: true });
    }
  }
  return { version: VERSION, profileColors, tags, sessionTags, sessionEmojis };
}

function createController(ctx) {
  let prefs = cleanPrefs(ctx.storage.get('prefs', null));
  const $prefs = atom(prefs);
  const themeState = { current: null };

  function persist(next) {
    prefs = next;
    $prefs.set(next);
    ctx.storage.set('prefs', next);
  }

  function accentFor(profile) {
    return Object.hasOwn(prefs.profileColors, profileId(profile)) ? prefs.profileColors[profileId(profile)] : null;
  }

  function backgroundFor(profile) {
    return darkColor(accentFor(profile));
  }

  function applyAccent() {
    setAccentOverride(accentFor(host.state.profile.get()));
  }

  function setProfileColor(color) {
    const normalized = color === null ? null : normColor(color);
    if (color !== null && !normalized) return false;
    const id = profileId(host.state.profile.get());
    const colors = { ...prefs.profileColors };
    if (normalized) Object.defineProperty(colors, id, { value: normalized, enumerable: true, configurable: true, writable: true });
    else delete colors[id];
    persist({ ...prefs, profileColors: colors });
    applyAccent();
    return true;
  }

  function createTag(name, emoji, color) {
    const normalizedName = typeof name === 'string' ? name.trim() : '';
    const normalizedEmoji = normEmoji(emoji);
    const normalizedColor = normColor(color);
    if (!normalizedName || normalizedName.length > 40 || !normalizedEmoji || !normalizedColor) return null;
    let id = globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    while (Object.hasOwn(prefs.tags, id)) id = globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    const tags = { ...prefs.tags };
    const tag = Object.assign(new Object(), { name: normalizedName, emoji: normalizedEmoji, color: normalizedColor });
    Object.defineProperty(tags, id, { value: tag, enumerable: true, configurable: true, writable: true });
    persist({ ...prefs, tags });
    return id;
  }

  function editTag(id, name, emoji, color) {
    const normalizedName = typeof name === 'string' ? name.trim() : '';
    const normalizedEmoji = normEmoji(emoji);
    const normalizedColor = normColor(color);
    if (!Object.hasOwn(prefs.tags, id) || !normalizedName || normalizedName.length > 40 || !normalizedEmoji || !normalizedColor) return false;
    const tags = { ...prefs.tags };
    Object.defineProperty(tags, id, { value: Object.assign(new Object(), { name: normalizedName, emoji: normalizedEmoji, color: normalizedColor }), enumerable: true, configurable: true, writable: true });
    persist({ ...prefs, tags });
    for (const [sessionId, tagId] of Object.entries(prefs.sessionTags)) {
      if (tagId === id) host.sessions.setColor(sessionId, normalizedColor);
    }
    return true;
  }

  function deleteTag(id) {
    if (!Object.hasOwn(prefs.tags, id)) return false;
    const tags = { ...prefs.tags };
    const sessionTags = { ...prefs.sessionTags };
    const affectedSessions = [];
    delete tags[id];
    for (const [sessionId, tagId] of Object.entries(sessionTags)) {
      if (tagId === id) {
        delete sessionTags[sessionId];
        affectedSessions.push(sessionId);
      }
    }
    persist({ ...prefs, tags, sessionTags });
    for (const sessionId of affectedSessions) host.sessions.setColor(sessionId, null);
    return true;
  }

  function setSessionTag(sessionId, tagId) {
    if (typeof sessionId !== 'string' || !sessionId) return false;
    if (tagId !== null && (typeof tagId !== 'string' || !Object.hasOwn(prefs.tags, tagId))) return false;
    const previousTagId = prefs.sessionTags[sessionId];
    const sessionTags = { ...prefs.sessionTags };
    const sessionEmojis = { ...prefs.sessionEmojis };
    delete sessionEmojis[sessionId];
    if (tagId) Object.defineProperty(sessionTags, sessionId, { value: tagId, enumerable: true, configurable: true, writable: true });
    else delete sessionTags[sessionId];
    persist({ ...prefs, sessionTags, sessionEmojis });
    if (tagId) host.sessions.setColor(sessionId, prefs.tags[tagId].color);
    else if (previousTagId) host.sessions.setColor(sessionId, null);
    return true;
  }

  for (const [sessionId, tagId] of Object.entries(prefs.sessionTags)) {
    host.sessions.setColor(sessionId, prefs.tags[tagId].color);
  }

  const unsubscribe = host.state.profile.subscribe(applyAccent);
  // subscribe() may invoke immediately, but explicitly cover stores without that behavior.
  applyAccent();
  ctx.onDispose(() => {
    unsubscribe();
    setAccentOverride(null);
    for (const sessionId of Object.keys(prefs.sessionTags)) host.sessions.setColor(sessionId, null);
  });
  return { $prefs, themeState, accentFor, backgroundFor, setProfileColor, createTag, editTag, deleteTag, setSessionTag };
}

const headingClass = 'mb-1.5 text-[11px] font-semibold text-(--ui-text-secondary)';
const buttonClass = 'rounded border border-(--dt-border) px-2 py-1 text-[11px] hover:bg-(--chrome-action-hover) focus-visible:outline';

function ColorEditor({ ctrl }) {
  const currentProfile = useValue(host.state.profile);
  const prefs = useValue(ctrl.$prefs);
  const savedColor = Object.hasOwn(prefs.profileColors, profileId(currentProfile))
    ? prefs.profileColors[profileId(currentProfile)] : null;
  const [typed, setTyped] = useState(savedColor ?? FALLBACK_COLOR);
  useEffect(() => setTyped(savedColor ?? FALLBACK_COLOR), [currentProfile, savedColor]);

  return jsxs('section', { className: 'flex flex-col gap-2', children: [
    jsx('h3', { className: headingClass, children: 'Profile color' }),
    jsxs('div', { className: 'flex items-center gap-2', children: [
      jsx('input', {
        type: 'color', value: savedColor ?? FALLBACK_COLOR,
        className: 'h-7 w-9 cursor-pointer border-0 bg-transparent p-0',
        'aria-label': 'Select profile color',
        onChange: (event) => ctrl.setProfileColor(event.target.value),
      }),
      jsx('input', {
        type: 'text', value: typed, spellCheck: false, maxLength: 7,
        'aria-label': 'Profile color in hexadecimal',
        className: 'min-w-0 flex-1 rounded border border-(--dt-border) bg-transparent px-2 py-1 font-mono text-[11px]',
        onChange: (event) => {
          setTyped(event.target.value);
          if (validColor(event.target.value)) ctrl.setProfileColor(event.target.value);
        },
        onBlur: () => setTyped(ctrl.accentFor(host.state.profile.get()) ?? FALLBACK_COLOR),
      }),
      jsx('button', { type: 'button', className: buttonClass,
        onClick: () => ctrl.setProfileColor(null), children: 'Restore' }),
    ] }),
    jsx('div', { className: 'flex flex-wrap gap-1', children: COLORS.map((color) =>
      jsx('button', { key: color, type: 'button', title: color,
        'aria-label': `Apply color ${color}`,
        'aria-pressed': savedColor === color,
        onClick: () => ctrl.setProfileColor(color),
        className: 'h-5 w-5 shrink-0 rounded-sm border border-(--dt-border) focus-visible:outline',
        style: { backgroundColor: color, outline: savedColor === color ? '2px solid var(--ui-text-primary)' : undefined, outlineOffset: 1 },
      }, color)),
    }),
    jsx('p', { className: 'text-[10px] text-(--ui-text-tertiary)',
      children: `Profile: ${currentProfile || 'default'} · ${savedColor ?? 'theme default color'}` }),
  ] });
}

function TagEditor({ ctrl, sessionId, surfaceColor, showCreate = true }) {
  const prefs = useValue(ctrl.$prefs);
  const selectedTagId = sessionId && Object.hasOwn(prefs.sessionTags, sessionId) ? prefs.sessionTags[sessionId] : null;
  const legacyEmoji = sessionId && !selectedTagId && Object.hasOwn(prefs.sessionEmojis, sessionId) ? prefs.sessionEmojis[sessionId] : null;
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('');
  const [color, setColor] = useState(FALLBACK_COLOR);
  const [editingTagId, setEditingTagId] = useState(null);
  const [deleteCandidate, setDeleteCandidate] = useState(null);
  const tagEntries = Object.entries(prefs.tags);

  function clearForm() {
    setEditingTagId(null);
    setName('');
    setEmoji('');
    setColor(FALLBACK_COLOR);
  }

  function saveTag() {
    const saved = editingTagId
      ? ctrl.editTag(editingTagId, name, emoji, color)
      : ctrl.createTag(name, emoji, color);
    if (saved) clearForm();
  }

  return jsxs('section', { className: 'flex flex-col gap-2', children: [
    jsx('h3', { className: headingClass, children: 'Session tags' }),
    tagEntries.length ? jsxs('div', { className: 'flex flex-col gap-1', children: [
      !sessionId ? jsx('p', { className: 'text-[11px] text-(--ui-text-tertiary)', children: 'Open a session to assign a tag.' }) : null,
      jsx('div', { className: 'flex max-h-36 flex-col gap-1 overflow-y-auto', children: tagEntries.map(([id, tag]) => {
        const selected = selectedTagId === id;
        return jsxs('div', { className: 'flex items-center gap-1.5', children: [
          jsx('button', {
            type: 'button', disabled: !sessionId,
            title: sessionId ? `Assign ${tag.name} (${tag.emoji})` : `${tag.name} (open a session to assign)`,
            'aria-label': sessionId ? `Assign ${tag.name} tag to session` : `${tag.name} tag`, 'aria-pressed': selected,
            className: 'flex min-w-0 flex-1 items-center gap-2 rounded px-2 py-1 text-left text-[11px] hover:opacity-90 focus-visible:outline',
            style: { backgroundColor: `${tag.color}${TAG_FILL_ALPHA.toString(16).padStart(2, '0')}`, color: readableOn(compositeColor(tag.color, surfaceColor)) },
            onClick: () => { if (sessionId) ctrl.setSessionTag(sessionId, id); },
            children: jsxs('span', { className: 'flex items-center gap-2', children: [jsx('span', { 'aria-hidden': true, children: tag.emoji }), jsx('span', { className: 'truncate', children: tag.name })] }),
          }),
          showCreate ? jsxs('div', { className: 'flex shrink-0 gap-1', children: [
            jsx('button', { type: 'button', className: buttonClass, 'aria-label': `Edit tag ${tag.name}`,
              onClick: () => { setEditingTagId(id); setName(tag.name); setEmoji(tag.emoji); setColor(tag.color); }, children: 'Edit' }),
            jsx('button', { type: 'button', className: buttonClass, 'aria-label': `Delete tag ${tag.name}`,
              onClick: () => setDeleteCandidate({ id, name: tag.name, assignedCount: Object.values(prefs.sessionTags).filter((tagId) => tagId === id).length }), children: 'Delete' }),
          ] }) : null,
        ] }, id);
      }) }),
    ] }) : jsx('p', { className: 'text-[11px] text-(--ui-text-tertiary)', children: sessionId ? 'No tags yet. Create one below.' : 'Open a session to assign a tag.' }),
    legacyEmoji ? jsx('p', { className: 'text-[10px] text-(--ui-text-tertiary)', children: `Legacy emoji ${legacyEmoji} will remain until replaced or cleared.` }) : null,
    sessionId && (selectedTagId || legacyEmoji) ? jsx('button', { type: 'button', className: buttonClass,
      'aria-label': 'Clear session tag', onClick: () => ctrl.setSessionTag(sessionId, null), children: 'Clear tag' }) : null,
    showCreate ? jsxs('div', { className: 'flex flex-col gap-1.5 border-t border-(--dt-border) pt-2', children: [
      jsx('input', { type: 'text', value: name, maxLength: 40, placeholder: 'Tag name', 'aria-label': 'Tag name',
        className: 'rounded border border-(--dt-border) bg-transparent px-2 py-1 text-[11px]', onChange: (event) => setName(event.target.value) }),
      jsxs('div', { className: 'flex items-center gap-1.5', children: [
        jsx('input', { type: 'text', value: emoji, maxLength: 32, placeholder: 'Emoji', 'aria-label': 'Tag emoji',
          className: 'min-w-0 flex-1 rounded border border-(--dt-border) bg-transparent px-2 py-1 text-[12px]', onChange: (event) => setEmoji(event.target.value) }),
        jsx('input', { type: 'color', value: color, 'aria-label': 'Tag color', className: 'h-7 w-9 cursor-pointer border-0 bg-transparent p-0', onChange: (event) => setColor(event.target.value) }),
      ] }),
      jsxs('div', { className: 'flex gap-1.5', children: [
        jsx('button', { type: 'button', className: buttonClass, disabled: !name.trim() || !normEmoji(emoji) || !normColor(color),
          'aria-label': editingTagId ? 'Save tag' : 'Create tag', onClick: saveTag, children: editingTagId ? 'Save tag' : 'Create tag' }),
        editingTagId ? jsx('button', { type: 'button', className: buttonClass, 'aria-label': 'Cancel tag edit', onClick: clearForm, children: 'Cancel' }) : null,
      ] }),
    ] }) : null,
    showCreate && deleteCandidate ? jsx(ConfirmDialog, {
      open: true,
      title: `Delete “${deleteCandidate.name}”?`,
      description: `This removes the tag from ${deleteCandidate.assignedCount} assigned ${deleteCandidate.assignedCount === 1 ? 'session' : 'sessions'}.`,
      confirmLabel: 'Delete tag',
      destructive: true,
      onClose: () => setDeleteCandidate(null),
      onConfirm: () => {
        ctrl.deleteTag(deleteCandidate.id);
        if (editingTagId === deleteCandidate.id) clearForm();
      },
    }) : null,
  ] });
}

function PrismaMenu({ ctrl, sessionId }) {
  const profile = useValue(host.state.profile);
  const { theme } = useTheme();
  const background = ctrl.backgroundFor(profile);
  const surfaceColor = background ?? theme.colors.popover ?? theme.colors.background;
  useValue(ctrl.$prefs);
  return jsxs('div', { className: 'flex w-[278px] flex-col gap-3 p-3', style: { backgroundColor: background ?? undefined }, children: [
    jsx(ColorEditor, { ctrl }),
    jsx('hr', { className: 'border-(--dt-border)' }),
    jsx(TagEditor, { ctrl, sessionId, surfaceColor }),
  ] });
}

function StatusControl({ ctrl, ctx }) {
  const profile = useValue(host.state.profile);
  const sessionId = useValue(host.state.focusedStoredSessionId);
  const prefs = useValue(ctrl.$prefs);
  const color = Object.hasOwn(prefs.profileColors, profileId(profile)) ? prefs.profileColors[profileId(profile)] : null;
  const tagId = sessionId && prefs.sessionTags[sessionId];
  const tag = tagId ? prefs.tags[tagId] : null;
  const emoji = tag?.emoji ?? (sessionId && prefs.sessionEmojis[sessionId]) ?? '◇';
  const { theme, themeName, resolvedMode, previewTheme, clearThemePreview } = useTheme();
  const registered = ctrl.themeState;
  const signature = `${profileId(profile)}:${themeName}:${color}:${resolvedMode}`;
  const isPrismaTheme = theme.name.startsWith('prisma-profile-accent-');

  useEffect(() => {
    if (!color) {
      clearThemePreview();
      registered.current?.dispose();
      registered.current = null;
      setAccentOverride(null);
      return;
    }

    setAccentOverride(color);
    if (isPrismaTheme) {
      if (registered.current?.signature !== signature) {
        clearThemePreview();
        registered.current?.dispose();
        registered.current = null;
      }
      return;
    }

    if (registered.current) {
      clearThemePreview();
      registered.current.dispose();
      registered.current = null;
    }

    const background = darkColor(color);
    const colors = (palette) => ({ ...palette, background, foreground: readableOn(background), sidebarBackground: background });
    const base = themeName.replace(/[^a-z0-9-]/gi, '-').toLowerCase();
    const data = {
      ...theme,
      name: `prisma-profile-accent-${base}-${color.slice(1).toLowerCase()}`,
      label: 'Prisma',
      description: `Darkened ${color} background for profile ${profileId(profile)}, based on ${theme.label}.`,
      accentOf: undefined,
      colors: colors(theme.colors),
      darkColors: colors(theme.darkColors ?? theme.colors),
    };
    registered.current = { signature, dispose: ctx.register({ id: 'accent-background', area: THEMES_AREA, data }) };
    previewTheme(data.name, resolvedMode);
  }, [profile, color, themeName, resolvedMode, theme.name]);

  useEffect(() => () => {
    clearThemePreview();
    setAccentOverride(null);
    registered.current?.dispose();
    registered.current = null;
  }, []);

  return jsxs(Popover, { children: [
    jsx(PopoverTrigger, { asChild: true, children: jsxs('button', {
      type: 'button', title: 'Prisma: profile colors and session tags', 'aria-label': 'Open Prisma',
      className: 'inline-flex h-full items-center gap-1.5 px-2 text-[11px] text-(--ui-text-secondary) hover:bg-(--chrome-action-hover)',
      children: [
        jsx('span', { className: 'h-2.5 w-2.5 rounded-full border border-(--dt-border)', style: { backgroundColor: color ?? 'var(--ui-text-tertiary)' } }),
        jsx('span', { className: 'max-w-[90px] truncate', children: profile || 'default' }),
        jsx('span', { 'aria-hidden': true, children: emoji }),
      ],
    }) }),
    jsx(PopoverContent, { side: 'top', align: 'end', className: 'w-auto p-0', children: jsx(PrismaMenu, { ctrl, sessionId }) }),
  ] });
}

function RowControl({ ctrl, sessionId }) {
  const { theme } = useTheme();
  const surfaceColor = theme.colors.popover ?? theme.colors.background;
  const prefs = useValue(ctrl.$prefs);
  const tagId = prefs.sessionTags[sessionId];
  const tag = tagId ? prefs.tags[tagId] : null;
  const legacyEmoji = !tag && Object.hasOwn(prefs.sessionEmojis, sessionId) ? prefs.sessionEmojis[sessionId] : null;
  const emoji = tag?.emoji ?? legacyEmoji;
  return jsxs(Popover, { children: [
    jsx(PopoverTrigger, { asChild: true, children: jsx('button', {
      type: 'button',
      title: tag ? `Prisma: change tag ${tag.name}` : legacyEmoji ? `Legacy session emoji (${legacyEmoji})` : 'Prisma: assign a session tag',
      'aria-label': tag ? `Session tag ${tag.name} (${tag.emoji})` : legacyEmoji ? `Legacy session emoji (${legacyEmoji})` : 'Assign a session tag',
      className: 'rounded border border-(--dt-border) px-1 text-[12px] opacity-80 hover:opacity-100 focus-visible:opacity-100',
      style: tag ? { backgroundColor: `${tag.color}80`, color: readableOn(tag.color) } : {},
      onClick: (event) => event.stopPropagation(),
      onPointerDown: (event) => event.stopPropagation(),
      onDoubleClick: (event) => event.stopPropagation(),
      children: emoji ?? '+',
    }) }),
    jsx(PopoverContent, { side: 'right', align: 'start', className: 'w-auto p-0',
      onClick: (event) => event.stopPropagation(),
      children: jsx('div', { className: 'w-[260px] p-3', children: jsx(TagEditor, { ctrl, sessionId, surfaceColor, showCreate: false }) }),
    }),
  ] });
}

function SettingsPage({ ctrl }) {
  const profile = useValue(host.state.profile);
  const sessionId = useValue(host.state.focusedStoredSessionId);
  const { theme } = useTheme();
  const background = ctrl.backgroundFor(profile);
  const surfaceColor = background ?? theme.colors.background;
  useValue(ctrl.$prefs);
  return jsxs('div', { className: 'flex max-w-[440px] flex-col gap-4 p-4', style: { backgroundColor: background ?? undefined }, children: [
    jsx('h2', { className: 'text-base font-semibold', children: 'Prisma' }),
    jsx('p', { className: 'text-xs text-(--ui-text-secondary)', children: 'Persistent profile colors and custom emoji tags for sessions. Also available in the status bar and session rows.' }),
    jsx(ColorEditor, { ctrl }),
    jsx('hr', { className: 'border-(--dt-border)' }),
    jsx(TagEditor, { ctrl, sessionId, surfaceColor }),
  ] });
}

const TAGGED_SESSIONS_PATH = '/prisma/tagged-sessions';
const TAGGED_SESSION_LIMIT = 500;

function profileRouteKey(route) {
  return JSON.stringify([route.connectionId, route.profile, route.targetProfile]);
}

function profileRouteLabel(route, routes) {
  const name = route.targetProfile || route.profile || 'default';
  const duplicates = routes.filter((candidate) => candidate.targetProfile === route.targetProfile).length > 1;
  if (!duplicates) return name;
  const source = route.mode === 'local' ? 'This device' : `Remote ${String(route.connectionId).slice(0, 8)}`;
  return `${name} · ${source}`;
}

function taggedAssignments(prefs) {
  return Object.entries(prefs.sessionTags)
    .map(([sessionId, tagId]) => ({ sessionId, tagId, tag: prefs.tags[tagId] }))
    .filter((row) => row.tag);
}

async function loadTaggedSessions(prefs) {
  if (!Object.keys(prefs.sessionTags).length) {
    return { routes: [], rows: [], unavailable: [], errors: [], incomplete: false };
  }

  const routes = await host.profileRoutes();
  if (!Array.isArray(routes)) throw new Error('Profile routes unavailable');
  const results = await Promise.all(routes.map(async (route) => {
    try {
      // shortcut: the SDK exposes only the first 500 persisted sessions; use cursor pagination when available.
      const page = await host.listPersistedSessions(route, { profile: route.targetProfile, limit: TAGGED_SESSION_LIMIT });
      const sessions = Array.isArray(page?.sessions) ? page.sessions : [];
      return { route, sessions, total: Number.isFinite(page?.total) ? page.total : sessions.length, failed: false };
    } catch {
      return { route, sessions: [], total: null, failed: true };
    }
  }));

  const knownIds = new Set();
  const rows = [];
  const errors = [];
  let incomplete = false;
  for (const result of results) {
    if (result.failed) errors.push(result.route);
    if (!result.failed && result.total > result.sessions.length) incomplete = true;
    for (const session of result.sessions) {
      const ids = [session?._lineage_root_id, session?.id, ...(Array.isArray(session?._lineage_ids) ? session._lineage_ids : [])]
        .filter((id) => typeof id === 'string' && id.length);
      for (const id of ids) knownIds.add(id);
      const assignmentId = ids.find((id) => Object.hasOwn(prefs.sessionTags, id));
      if (!assignmentId) continue;
      const tagId = prefs.sessionTags[assignmentId];
      const tag = prefs.tags[tagId];
      if (tag) rows.push({ sessionId: ids[0], assignmentId, session, tagId, tag, route: result.route });
    }
  }

  const unavailable = taggedAssignments(prefs).filter((row) => !knownIds.has(row.sessionId));
  return { routes, rows, unavailable, errors, incomplete };
}

function TaggedSessionsPage({ ctrl }) {
  const prefs = useValue(ctrl.$prefs);
  const { theme } = useTheme();
  const [data, setData] = useState({ loading: true, error: false, routes: [], rows: [], unavailable: [], errors: [], incomplete: false });
  const [profileFilter, setProfileFilter] = useState('all');
  const [tagFilter, setTagFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [openError, setOpenError] = useState('');

  useEffect(() => {
    let active = true;
    setData((current) => ({ ...current, loading: true, error: false }));
    loadTaggedSessions(prefs).then((result) => {
      if (active) setData({ ...result, loading: false, error: false });
    }).catch(() => {
      if (active) setData({ loading: false, error: true, routes: [], rows: [], unavailable: taggedAssignments(prefs), errors: [], incomplete: false });
    });
    return () => { active = false; };
  }, [refresh, prefs.sessionTags, prefs.tags]);

  const tags = Object.entries(prefs.tags).sort((a, b) => a[1].name.localeCompare(b[1].name));
  const query = search.trim().toLowerCase();
  const matches = (row, label = '') => {
    if (tagFilter !== 'all' && row.tagId !== tagFilter) return false;
    if (!query) return true;
    const session = row.session ?? {};
    return [session.title, session.preview, row.sessionId, row.tag.name, row.tag.emoji, label]
      .some((value) => String(value ?? '').toLowerCase().includes(query));
  };
  const visibleRows = data.rows.filter((row) => {
    const label = profileRouteLabel(row.route, data.routes);
    return (profileFilter === 'all' || profileFilter === profileRouteKey(row.route)) && matches(row, label);
  });
  const visibleUnavailable = profileFilter === 'all' ? data.unavailable.filter((row) => matches(row)) : [];
  const groups = [];
  for (const row of visibleRows) {
    const key = profileRouteKey(row.route);
    let group = groups.find((item) => item.key === key);
    if (!group) {
      group = { key, label: profileRouteLabel(row.route, data.routes), rows: [] };
      groups.push(group);
    }
    group.rows.push(row);
  }
  const count = visibleRows.length + visibleUnavailable.length;
  const tagBadge = (tag) => jsx(Badge, {
    className: 'shrink-0 border-0 px-1.5 py-0.5 text-xs font-medium',
    style: { backgroundColor: `${tag.color}${TAG_FILL_ALPHA.toString(16).padStart(2, '0')}`, color: readableOn(compositeColor(tag.color, theme.colors.background)) },
    children: `${tag.emoji} ${tag.name}`,
  });

  return jsxs('main', { className: 'mx-auto flex h-full min-h-0 w-full max-w-4xl flex-col gap-4 overflow-y-auto p-5', children: [
    jsxs('header', { className: 'flex items-start justify-between gap-3', children: [
      jsxs('div', { children: [
        jsx('h1', { className: 'text-lg font-semibold', children: 'Tagged sessions' }),
        jsx('p', { className: 'mt-1 text-sm text-(--ui-text-secondary)', children: 'Review Prisma-tagged sessions across profiles.' }),
      ] }),
      jsx(Badge, { variant: 'outline', 'aria-live': 'polite', children: data.loading ? '…' : `${count} ${count === 1 ? 'session' : 'sessions'}` }),
    ] }),
    jsxs('div', { className: 'grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_2fr_auto]', children: [
      jsx(Select, { value: profileFilter, onValueChange: setProfileFilter, 'aria-label': 'Profile filter', children: [
        jsx(SelectTrigger, { 'aria-label': 'Profile filter', children: jsx(SelectValue, { placeholder: 'All profiles' }) }),
        jsx(SelectContent, { children: [
          jsx(SelectItem, { value: 'all', children: 'All profiles' }),
          ...data.routes.map((route) => jsx(SelectItem, { key: profileRouteKey(route), value: profileRouteKey(route), children: profileRouteLabel(route, data.routes) })),
        ] }),
      ] }),
      jsx(Select, { value: tagFilter, onValueChange: setTagFilter, 'aria-label': 'Tag filter', children: [
        jsx(SelectTrigger, { 'aria-label': 'Tag filter', children: jsx(SelectValue, { placeholder: 'All tags' }) }),
        jsx(SelectContent, { children: [
          jsx(SelectItem, { value: 'all', children: 'All tags' }),
          ...tags.map(([id, tag]) => jsx(SelectItem, { key: id, value: id, children: tag.name })),
        ] }),
      ] }),
      jsx(Input, { type: 'search', value: search, placeholder: 'Search title, preview, or session ID', 'aria-label': 'Search tagged sessions', onChange: (event) => setSearch(event.target.value) }),
      jsx(Button, { type: 'button', variant: 'outline', onClick: () => setRefresh((value) => value + 1), 'aria-label': 'Refresh tagged sessions', children: 'Refresh' }),
    ] }),
    data.loading ? jsx('p', { role: 'status', 'aria-live': 'polite', className: 'text-sm text-(--ui-text-secondary)', children: 'Loading tagged sessions…' }) : null,
    data.error ? jsx(ErrorState, { title: 'Unable to load profile routes', description: 'Check the connection and retry.', children: jsx(Button, { type: 'button', onClick: () => setRefresh((value) => value + 1), children: 'Retry' }) }) : null,
    ...data.errors.map((route) => jsx('div', { role: 'alert', className: 'rounded-lg border border-(--dt-border) px-3 py-2 text-sm text-(--ui-text-secondary)', children: `Could not load ${profileRouteLabel(route, data.routes)}. Any matching assignment remains visible by session ID.` }, profileRouteKey(route))),
    data.incomplete ? jsx('p', { role: 'status', className: 'text-xs text-(--ui-text-secondary)', children: 'Some profile lists are incomplete (500-session SDK limit); tagged assignments outside the returned page remain visible by ID.' }) : null,
    openError ? jsx('p', { role: 'alert', className: 'text-sm text-destructive', children: openError }) : null,
    profileFilter !== 'all' && data.unavailable.length ? jsx('p', { className: 'text-xs text-(--ui-text-secondary)', children: 'Assignments without profile details appear when All profiles is selected.' }) : null,
    data.loading ? null : count ? jsxs('div', { className: 'flex flex-col gap-4', children: [
      ...groups.map((group) => jsxs('section', { 'aria-label': `${group.label} tagged sessions`, className: 'flex flex-col gap-2', children: [
        jsxs('h2', { className: 'flex items-center gap-2 text-sm font-medium', children: [group.label, jsx('span', { className: 'text-xs text-(--ui-text-tertiary)', children: group.rows.length })] }),
        ...group.rows.map((row) => {
          const title = typeof row.session.title === 'string' && row.session.title.trim() ? row.session.title : 'Untitled session';
          return jsxs('div', { className: 'flex items-center justify-between gap-3 rounded-lg border border-(--dt-border) px-3 py-2 hover:bg-(--chrome-action-hover)', children: [
            jsxs('div', { className: 'min-w-0', children: [
              jsx('div', { className: 'truncate text-sm font-medium', children: title }),
              row.session.preview ? jsx('p', { className: 'mt-0.5 line-clamp-1 text-xs text-(--ui-text-secondary)', children: row.session.preview }) : null,
            ] }),
            jsxs('div', { className: 'flex shrink-0 items-center gap-2', children: [
              tagBadge(row.tag),
              jsx(Button, { type: 'button', size: 'sm', variant: 'ghost', 'aria-label': `Open tagged session ${title}`, onClick: () => host.openSession(row.sessionId, { route: row.route }).catch(() => setOpenError('Unable to open this session. Refresh and try again.')), children: 'Open' }),
            ] }),
          ] }, `${profileRouteKey(row.route)}:${row.sessionId}`);
        }),
      ] }, group.key)),
      visibleUnavailable.length ? jsxs('section', { 'aria-label': 'Session details unavailable', className: 'flex flex-col gap-2', children: [
        jsx('h2', { className: 'text-sm font-medium', children: 'Session details unavailable' }),
        jsx('p', { className: 'text-xs text-(--ui-text-secondary)', children: 'These tag assignments are preserved, but their sessions are outside the available profile results.' }),
        ...visibleUnavailable.map((row) => jsxs('div', { role: 'group', 'aria-label': `Tagged session unavailable: ${row.sessionId}`, className: 'flex items-center justify-between gap-3 rounded-lg border border-(--dt-border) px-3 py-2', children: [
          jsx('code', { className: 'truncate text-xs', children: row.sessionId }), tagBadge(row.tag),
        ] }, row.sessionId)),
      ] }) : null,
    ] }) : jsx(EmptyState, {
      title: Object.keys(prefs.sessionTags).length ? 'No matching sessions' : 'No tagged sessions yet',
      description: Object.keys(prefs.sessionTags).length ? 'Try a different profile, tag, or search term.' : 'Assign a Prisma tag from a session row to start.',
      className: 'min-h-48',
    }),
  ] });
}

export default {
  id: 'prisma',
  name: 'Prisma',
  description: 'Create colored emoji tags for sessions and save profile-specific accent colors.',
  defaultEnabled: true,
  register(ctx) {
    const ctrl = createController(ctx);
    ctx.registerMany([
      { id: 'status', area: STATUSBAR_AREAS.right, order: 95, render: () => jsx(StatusControl, { ctrl, ctx }) },
      { id: 'session-tag', area: SESSION_ROW_AREAS.trailing, data: {
        render: ({ sessionId }) => jsx(RowControl, { ctrl, sessionId }),
      } },
      { id: 'reset-profile', area: PALETTE_AREA, data: {
        id: 'prisma.reset-profile', label: 'Prisma: restore profile color',
        keywords: ['prisma', 'accent', 'profile', 'color', 'reset'],
        run: () => ctrl.setProfileColor(null),
      } },
      { id: 'clear-session', area: PALETTE_AREA, data: {
        id: 'prisma.clear-session', label: 'Prisma: clear current session tag',
        keywords: ['prisma', 'tag', 'session', 'clear'],
        run: () => {
          const sessionId = host.state.focusedStoredSessionId.get();
          if (sessionId) ctrl.setSessionTag(sessionId, null);
        },
      } },
      { id: 'tagged-sessions-page', area: ROUTES_AREA, data: { path: TAGGED_SESSIONS_PATH },
        render: () => jsx(TaggedSessionsPage, { ctrl }) },
      { id: 'tagged-sessions-nav', area: SIDEBAR_NAV_AREA, order: 65, data: {
        path: TAGGED_SESSIONS_PATH, label: 'Tagged sessions', codicon: 'tag',
      } },
    ]);
    if (ctx.registerSettingsPage) {
      ctx.registerSettingsPage({ id: 'settings', title: 'Prisma', icon: 'symbol-color',
        render: () => jsx(SettingsPage, { ctrl }) });
    }
  },
};
