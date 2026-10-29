/**
 * Prisma — persistent profile accents and colored session tags for Hermes Desktop.
 * Disk plugin: the Hermes Desktop loader resolves @hermes/plugin-sdk and react/jsx-runtime.
 * No DOM scraping, no network access, and no agent/gateway actions.
 */
import {
  atom,
  host,
  PALETTE_AREA,
  Popover,
  PopoverContent,
  PopoverTrigger,
  readableOn,
  SESSION_ROW_AREAS,
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
const COLORS = ['#4A84FE', '#8250DF', '#BF3989', '#196D31', '#BC4C00', '#0E7490', '#E11D48', '#EAB308', '#64748B', '#14B8A6'];

const record = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const validColor = (value) => typeof value === 'string' && /^#[\da-f]{6}$/i.test(value);
const normColor = (value) => validColor(value) ? value.toUpperCase() : null;
const darkColor = (value) => {
  const color = normColor(value);
  return color ? `#${[1, 3, 5].map((index) => Math.floor(parseInt(color.slice(index, index + 2), 16) * 0.08).toString(16).padStart(2, '0')).join('')}`.toUpperCase() : null;
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
  return { $prefs, themeState, accentFor, backgroundFor, setProfileColor, createTag, setSessionTag };
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

function TagEditor({ ctrl, sessionId, showCreate = true }) {
  const prefs = useValue(ctrl.$prefs);
  const selectedTagId = sessionId && Object.hasOwn(prefs.sessionTags, sessionId) ? prefs.sessionTags[sessionId] : null;
  const legacyEmoji = sessionId && !selectedTagId && Object.hasOwn(prefs.sessionEmojis, sessionId) ? prefs.sessionEmojis[sessionId] : null;
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('');
  const [color, setColor] = useState(FALLBACK_COLOR);
  const tagEntries = Object.entries(prefs.tags);

  return jsxs('section', { className: 'flex flex-col gap-2', children: [
    jsx('h3', { className: headingClass, children: 'Session tags' }),
    sessionId && tagEntries.length ? jsx('div', { className: 'flex max-h-36 flex-col gap-1 overflow-y-auto', children: tagEntries.map(([id, tag]) => {
      const selected = selectedTagId === id;
      return jsx('button', {
        key: id, type: 'button', title: `Assign ${tag.name} (${tag.emoji})`,
        'aria-label': `Assign ${tag.name} tag to session`, 'aria-pressed': selected,
        className: 'flex items-center gap-2 rounded border border-(--dt-border) px-2 py-1 text-left text-[11px] hover:opacity-90 focus-visible:outline',
        style: { backgroundColor: tag.color, color: readableOn(tag.color), outline: selected ? '2px solid var(--ui-text-primary)' : undefined, outlineOffset: 1 },
        onClick: () => ctrl.setSessionTag(sessionId, id),
        children: jsxs('span', { className: 'flex items-center gap-2', children: [jsx('span', { 'aria-hidden': true, children: tag.emoji }), jsx('span', { children: tag.name })] }),
      }, id);
    }) }) : jsx('p', { className: 'text-[11px] text-(--ui-text-tertiary)', children: sessionId ? 'No tags yet. Create one below.' : 'Open a session to assign a tag.' }),
    legacyEmoji ? jsx('p', { className: 'text-[10px] text-(--ui-text-tertiary)', children: `Legacy emoji ${legacyEmoji} will remain until replaced or cleared.` }) : null,
    sessionId && (selectedTagId || legacyEmoji) ? jsx('button', { type: 'button', className: buttonClass,
      'aria-label': 'Clear session tag', onClick: () => ctrl.setSessionTag(sessionId, null), children: 'Clear tag' }) : null,
    showCreate ? jsxs('div', { className: 'flex flex-col gap-1.5 border-t border-(--dt-border) pt-2', children: [
      jsx('input', { type: 'text', value: name, maxLength: 40, placeholder: 'Tag name', 'aria-label': 'Tag name',
        className: 'rounded border border-(--dt-border) bg-transparent px-2 py-1 text-[11px]', onChange: (event) => setName(event.target.value) }),
      jsx('div', { className: 'flex items-center gap-1.5', children: [
        jsx('input', { type: 'text', value: emoji, maxLength: 32, placeholder: 'Emoji', 'aria-label': 'Tag emoji',
          className: 'min-w-0 flex-1 rounded border border-(--dt-border) bg-transparent px-2 py-1 text-[12px]', onChange: (event) => setEmoji(event.target.value) }),
        jsx('input', { type: 'color', value: color, 'aria-label': 'Tag color', className: 'h-7 w-9 cursor-pointer border-0 bg-transparent p-0', onChange: (event) => setColor(event.target.value) }),
      ] }),
      jsx('button', { type: 'button', className: buttonClass, disabled: !name.trim() || !normEmoji(emoji) || !normColor(color),
        'aria-label': 'Create tag', onClick: () => { if (ctrl.createTag(name, emoji, color)) { setName(''); setEmoji(''); setColor(FALLBACK_COLOR); } }, children: 'Create tag' }),
    ] }) : null,
  ] });
}

function PrismaMenu({ ctrl, sessionId }) {
  const profile = useValue(host.state.profile);
  useValue(ctrl.$prefs);
  return jsxs('div', { className: 'flex w-[278px] flex-col gap-3 p-3', style: { backgroundColor: ctrl.backgroundFor(profile) ?? undefined }, children: [
    jsx(ColorEditor, { ctrl }),
    jsx('hr', { className: 'border-(--dt-border)' }),
    jsx(TagEditor, { ctrl, sessionId }),
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
      style: tag ? { backgroundColor: tag.color, color: readableOn(tag.color) } : {},
      onClick: (event) => event.stopPropagation(),
      onPointerDown: (event) => event.stopPropagation(),
      onDoubleClick: (event) => event.stopPropagation(),
      children: emoji ?? '+',
    }) }),
    jsx(PopoverContent, { side: 'right', align: 'start', className: 'w-auto p-0',
      onClick: (event) => event.stopPropagation(),
      children: jsx('div', { className: 'w-[260px] p-3', children: jsx(TagEditor, { ctrl, sessionId, showCreate: false }) }),
    }),
  ] });
}

function SettingsPage({ ctrl }) {
  const profile = useValue(host.state.profile);
  const sessionId = useValue(host.state.focusedStoredSessionId);
  useValue(ctrl.$prefs);
  return jsxs('div', { className: 'flex max-w-[440px] flex-col gap-4 p-4', style: { backgroundColor: ctrl.backgroundFor(profile) ?? undefined }, children: [
    jsx('h2', { className: 'text-base font-semibold', children: 'Prisma' }),
    jsx('p', { className: 'text-xs text-(--ui-text-secondary)', children: 'Persistent profile colors and custom emoji tags for sessions. Also available in the status bar and session rows.' }),
    jsx(ColorEditor, { ctrl }),
    jsx('hr', { className: 'border-(--dt-border)' }),
    jsx(TagEditor, { ctrl, sessionId }),
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
    ]);
    if (ctx.registerSettingsPage) {
      ctx.registerSettingsPage({ id: 'settings', title: 'Prisma', icon: 'symbol-color',
        render: () => jsx(SettingsPage, { ctrl }) });
    }
  },
};
