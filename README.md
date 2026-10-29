# Prisma — Hermes Desktop plugin

Prisma adds **persistent accent colors per profile** and **session emoji markers** to Hermes Desktop.

## Features

- Profile accent color follows the current Hermes Desktop profile. It is persisted in plugin-scoped storage and restored on profile switch or restart. The app-wide and sidebar backgrounds use a much darker shade of that accent via a temporary theme preview labeled **Prisma**, with the profile, accent, and base theme in its description; clearing the color or disabling Prisma restores the user's committed theme.
- Color input (native color picker + hexadecimal entry + ten preset swatches) and **Restore** action.
- Select a session emoji from ten named status presets or enter any one-grapheme custom emoji (including compound emojis). Clear it when no longer needed.
- Emoji is shown in each sidebar session row, with `+` to set an emoji when empty. Click a marker to edit that session directly, or use the status-bar Prisma popover for the focused session.
- Settings page under **Settings → Plugins → Prisma**, plus two commands in the command palette.
- Session annotations are keyed by **stored/durable session ID**, so they survive session ID rotations caused by context compression.

## Install (macOS/Linux)

From the extracted project directory:

```sh
./install.sh
```

Or manually, without invoking an installer:

```sh
mkdir -p "${HERMES_HOME:-$HOME/.hermes}/desktop-plugins/prisma"
cp desktop/plugin.js "${HERMES_HOME:-$HOME/.hermes}/desktop-plugins/prisma/plugin.js"
```

In Hermes Desktop, open **Capabilities → Plugins** and enable **Prisma** if it is disabled. The app watches desktop plugins; if it doesn't show up, run **Command Center → Reload desktop plugins**.

## Use

1. Use the **Prisma** control in the bottom-right status bar to select an accent for the currently active profile. On switching profiles, each saved color is restored.
2. Click the **+** (or existing emoji) in a session row to assign/change its marker, or choose an emoji for the focused session in the Prisma control.
3. Choose a preset: 📝 Planning; 🔍 Investigating; ⚙️ In progress; ⏸️ Paused; 🚧 Blocked; 🧪 Testing; ✅ Done; ❌ Failed; ⭐ Priority; 💡 Idea. Or type a custom emoji.
4. **Restore** clears only the current profile's color. **Clear** removes only the selected session's emoji.

## Technical notes and limitations

- **Hermes Desktop only.** It does not change classic terminal, Discord, Telegram, or web dashboard session lists.
- Requires a Hermes Desktop build with the SDK's `SESSION_ROW_AREAS`, `host.state.focusedStoredSessionId`, `ctx.storage`, and `setAccentOverride` APIs. These are described in the current [Desktop Plugin SDK](https://hermes-agent.nousresearch.com/docs/developer-guide/desktop-plugin-sdk). Compatibility with an installed Hermes version must be checked in the actual app.
- The accent override is a **single app-wide value** owned by the SDK. Do not enable Prisma alongside **Accent Picker** or another plugin writing `setAccentOverride`: concurrent writes may overwrite each other.
- Stored color isolation uses the **active profile identifier** supplied by `host.state.profile`. Two unrelated remote Hermes gateways with exactly the same profile identifier may share the color in one app installation; the SDK does not provide a gateway identity in the profile atom.
- Emoji markers reflect the **manually selected status**. They do not automatically track whether the agent is running, blocked, or finished. That requires a separate status-to-emoji policy.
- Emoji annotations are stored locally in the desktop plugin's storage, scoped to its app instance. They do not sync to all devices, and are not guaranteed to be included in Hermes profile export/import.
- No Hermes source modifications, DOM scraping, external requests, additional packages, or file-system permissions are needed at runtime.
- Disabling Prisma clears the applied override for the app session, but preserves preferences so re-enabling restores them.

## Validation

```sh
node --check desktop/plugin.js
node --experimental-vm-modules --test tests/plugin.test.mjs
```

These tests exercise the plugin module using an SDK test double. **They are not a replacement for installing and checking the plugin in a live Hermes Desktop build**.

## Distribution

`desktop/plugin.js` is the directly loadable single-file artifact. `plugin.yaml` provides catalog-style package metadata. To publish to the official plugin catalog, host the plugin in a versioned repository and follow Hermes's plugin review process.
