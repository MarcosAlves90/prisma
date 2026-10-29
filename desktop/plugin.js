/**
 * Prisma — persistent profile accents and session emoji markers for Hermes Desktop.
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

const VERSION = 1;
const FALLBACK_COLOR = '#4A84FE';
const COLORS = ['#4A84FE', '#8250DF', '#BF3989', '#196D31', '#BC4C00', '#0E7490', '#E11D48', '#EAB308', '#64748B', '#14B8A6'];
const STATUS_PRESETS = [
  { emoji: '📝', name: 'Planning' },
  { emoji: '🔍', name: 'Investigating' },
  { emoji: '⚙️', name: 'In progress' },
  { emoji: '⏸️', name: 'Paused' },
  { emoji: '🚧', name: 'Blocked' },
  { emoji: '🧪', name: 'Testing' },
  { emoji: '✅', name: 'Done' },
  { emoji: '❌', name: 'Failed' },
  { emoji: '⭐', name: 'Priority' },
  { emoji: '💡', name: 'Idea' },
];

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
  const sessionEmojis = {};
  if (record(input) && record(input.profileColors)) {
    for (const [key, value] of Object.entries(input.profileColors)) {
      const color = normColor(value);
      if (color) Object.defineProperty(profileColors, key, { value: color, enumerable: true, configurable: true, writable: true });
    }
  }
  if (record(input) && record(input.sessionEmojis)) {
    for (const [key, value] of Object.entries(input.sessionEmojis)) {
      const emoji = normEmoji(value);
      if (emoji) Object.defineProperty(sessionEmojis, key, { value: emoji, enumerable: true, configurable: true, writable: true });
    }
  }
  return { version: VERSION, profileColors, sessionEmojis };
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

  function setSessionEmoji(sessionId, emoji) {
    if (typeof sessionId !== 'string' || !sessionId) return false;
    const normalized = emoji === null ? null : normEmoji(emoji);
    if (emoji !== null && !normalized) return false;
    const entries = { ...prefs.sessionEmojis };
    if (normalized) Object.defineProperty(entries, sessionId, { value: normalized, enumerable: true, configurable: true, writable: true });
    else delete entries[sessionId];
    persist({ ...prefs, sessionEmojis: entries });
    return true;
  }

  const unsubscribe = host.state.profile.subscribe(applyAccent);
  // subscribe() may invoke immediately, but explicitly cover stores without that behavior.
  applyAccent();
  ctx.onDispose(() => {
    unsubscribe();
    setAccentOverride(null);
  });
  return { $prefs, themeState, accentFor, backgroundFor, setProfileColor, setSessionEmoji };
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
    jsx('div', { className: 'grid grid-cols-10 gap-1', children: COLORS.map((color) =>
      jsx('button', { key: color, type: 'button', title: color,
        'aria-label': `Apply color ${color}`,
        'aria-pressed': savedColor === color,
        onClick: () => ctrl.setProfileColor(color),
        className: 'h-5 rounded-sm border border-(--dt-border) focus-visible:outline',
        style: { backgroundColor: color, outline: savedColor === color ? '2px solid var(--ui-text-primary)' : undefined, outlineOffset: 1 },
      }, color)),
    }),
    jsx('p', { className: 'text-[10px] text-(--ui-text-tertiary)',
      children: `Profile: ${currentProfile || 'default'} · ${savedColor ?? 'theme default color'}` }),
  ] });
}

function EmojiEditor({ ctrl, sessionId }) {
  const prefs = useValue(ctrl.$prefs);
  const selected = sessionId && Object.hasOwn(prefs.sessionEmojis, sessionId) ? prefs.sessionEmojis[sessionId] : null;
  const [custom, setCustom] = useState('');
  const normalized = normEmoji(custom);

  return jsxs('section', { className: 'flex flex-col gap-2', children: [
    jsx('h3', { className: headingClass, children: 'Session emoji' }),
    sessionId ? jsxs('div', { className: 'grid grid-cols-5 gap-1', children: STATUS_PRESETS.map((item) =>
      jsx('button', {
        key: item.emoji, type: 'button', title: item.name,
        'aria-label': item.name, 'aria-pressed': selected === item.emoji,
        className: `rounded border px-1 py-1 text-lg hover:bg-(--chrome-action-hover) ${selected === item.emoji ? 'border-(--ui-text-primary)' : 'border-(--dt-border)'}`,
        onClick: () => ctrl.setSessionEmoji(sessionId, item.emoji),
        children: item.emoji,
      }, item.emoji)),
    }) : jsx('p', { className: 'text-[11px] text-(--ui-text-tertiary)', children: 'Open a session to assign an emoji.' }),
    sessionId ? jsxs('div', { className: 'flex items-center gap-1.5', children: [
      jsx('input', {
        type: 'text', value: custom, maxLength: 32, spellCheck: false,
        placeholder: 'Another emoji…', 'aria-label': 'Custom emoji',
        className: 'min-w-0 flex-1 rounded border border-(--dt-border) bg-transparent px-2 py-1 text-[12px]',
        onChange: (event) => setCustom(event.target.value),
        onKeyDown: (event) => {
          if (event.key === 'Enter' && normalized) { ctrl.setSessionEmoji(sessionId, normalized); setCustom(''); }
        },
      }),
      jsx('button', { type: 'button', disabled: !normalized, className: buttonClass,
        onClick: () => { if (normalized) { ctrl.setSessionEmoji(sessionId, normalized); setCustom(''); } },
        children: 'Apply' }),
      jsx('button', { type: 'button', disabled: !selected, className: buttonClass,
        onClick: () => ctrl.setSessionEmoji(sessionId, null), children: 'Clear' }),
    ] }) : null,
    jsx('p', { className: 'text-[10px] text-(--ui-text-tertiary)',
      children: selected ? `Selected: ${selected}` : 'No emoji assigned.' }),
  ] });
}

function PrismaMenu({ ctrl, sessionId }) {
  const profile = useValue(host.state.profile);
  useValue(ctrl.$prefs);
  return jsxs('div', { className: 'flex w-[278px] flex-col gap-3 p-3', style: { backgroundColor: ctrl.backgroundFor(profile) ?? undefined }, children: [
    jsx(ColorEditor, { ctrl }),
    jsx('hr', { className: 'border-(--dt-border)' }),
    jsx(EmojiEditor, { ctrl, sessionId }),
  ] });
}

function StatusControl({ ctrl, ctx }) {
  const profile = useValue(host.state.profile);
  const sessionId = useValue(host.state.focusedStoredSessionId);
  const prefs = useValue(ctrl.$prefs);
  const color = Object.hasOwn(prefs.profileColors, profileId(profile)) ? prefs.profileColors[profileId(profile)] : null;
  const emoji = sessionId && Object.hasOwn(prefs.sessionEmojis, sessionId) ? prefs.sessionEmojis[sessionId] : '◇';
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
      type: 'button', title: 'Prisma: profile colors and session emojis', 'aria-label': 'Open Prisma',
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
  const selected = Object.hasOwn(prefs.sessionEmojis, sessionId) ? prefs.sessionEmojis[sessionId] : null;
  return jsxs(Popover, { children: [
    jsx(PopoverTrigger, { asChild: true, children: jsx('button', {
      type: 'button',
      title: selected ? `Prisma: change emoji ${selected}` : 'Prisma: assign a session emoji',
      'aria-label': selected ? `Change session emoji (${selected})` : 'Assign session emoji',
      className: 'rounded px-0.5 text-[12px] opacity-70 hover:bg-(--chrome-action-hover) hover:opacity-100 focus-visible:opacity-100',
      onClick: (event) => event.stopPropagation(),
      onPointerDown: (event) => event.stopPropagation(),
      onDoubleClick: (event) => event.stopPropagation(),
      children: selected ?? '+',
    }) }),
    jsx(PopoverContent, { side: 'right', align: 'start', className: 'w-auto p-0',
      onClick: (event) => event.stopPropagation(),
      children: jsx('div', { className: 'w-[260px] p-3', children: jsx(EmojiEditor, { ctrl, sessionId }) }),
    }),
  ] });
}

function SettingsPage({ ctrl }) {
  const profile = useValue(host.state.profile);
  const sessionId = useValue(host.state.focusedStoredSessionId);
  useValue(ctrl.$prefs);
  return jsxs('div', { className: 'flex max-w-[440px] flex-col gap-4 p-4', style: { backgroundColor: ctrl.backgroundFor(profile) ?? undefined }, children: [
    jsx('h2', { className: 'text-base font-semibold', children: 'Prisma' }),
    jsx('p', { className: 'text-xs text-(--ui-text-secondary)', children: 'Persistent profile colors and session emojis. Also available in the status bar and session rows.' }),
    jsx(ColorEditor, { ctrl }),
    jsx('hr', { className: 'border-(--dt-border)' }),
    jsx(EmojiEditor, { ctrl, sessionId }),
  ] });
}

export default {
  id: 'prisma',
  name: 'Prisma',
  description: 'Persist profile-specific accent colors and mark sessions with custom or status emojis.',
  defaultEnabled: true,
  register(ctx) {
    const ctrl = createController(ctx);
    ctx.registerMany([
      { id: 'status', area: STATUSBAR_AREAS.right, order: 95, render: () => jsx(StatusControl, { ctrl, ctx }) },
      { id: 'session-emoji', area: SESSION_ROW_AREAS.trailing, data: {
        render: ({ sessionId }) => jsx(RowControl, { ctrl, sessionId }),
      } },
      { id: 'reset-profile', area: PALETTE_AREA, data: {
        id: 'prisma.reset-profile', label: 'Prisma: restore profile color',
        keywords: ['prisma', 'accent', 'profile', 'color', 'reset'],
        run: () => ctrl.setProfileColor(null),
      } },
      { id: 'clear-session', area: PALETTE_AREA, data: {
        id: 'prisma.clear-session', label: 'Prisma: clear current session emoji',
        keywords: ['prisma', 'emoji', 'session', 'clear'],
        run: () => {
          const sessionId = host.state.focusedStoredSessionId.get();
          if (sessionId) ctrl.setSessionEmoji(sessionId, null);
        },
      } },
    ]);
    if (ctx.registerSettingsPage) {
      ctx.registerSettingsPage({ id: 'settings', title: 'Prisma', icon: 'symbol-color',
        render: () => jsx(SettingsPage, { ctrl }) });
    }
  },
};
