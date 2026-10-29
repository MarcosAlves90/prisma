# Prisma — Hermes Desktop plugin

Prisma adds **persistent accent colors per profile** and **custom colored emoji tags for sessions** to Hermes Desktop.

## Features

- Profile accent color follows the current Hermes Desktop profile. It is persisted in plugin-scoped storage and restored on profile switch or restart. The app-wide and sidebar backgrounds use a much darker shade of that accent via a temporary theme preview labeled **Prisma**, with the profile, accent, and base theme in its description; clearing the color or disabling Prisma restores the user's committed theme.
- Color input (native color picker + hexadecimal entry + ten preset swatches) and **Restore** action.
- Create a tag with a name, one emoji, and a color, then assign one tag per session. The tag picker uses a translucent color fill, borderless spacing, and contrast-aware names. The session row shows the emoji on a semi-transparent badge derived from the tag color, and the session color indicator uses the full tag color. Existing tags can be edited in place or deleted after confirmation; deletion clears their session assignments and color overrides.
- Created tags remain listed in Prisma controls without an open session; assigning a tag requires a selected session.
- Assign or clear a tag from the session-row popover, or manage tags and the focused session from the Prisma status-bar popover or settings page.
- Settings page under **Settings → Plugins → Prisma**, plus two commands in the command palette.
- A **Tagged sessions** page in the sidebar displays assigned sessions across registered profiles in kanban-style tag columns, with profile/tag filters, text search, result counts, refresh, and direct open actions. Drag a session to change its tag, or use its tag selector; reorder columns by dragging their handles or using the arrow buttons. Column order is saved. Assignments without returned session details remain visible by ID.
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
2. Open Prisma from the status bar or settings page and create a tag by entering its name, emoji, and color.
3. Click **+** in a session row and select a tag. One tag is assigned per session; selecting another replaces it. Use **Clear tag** to remove it.
4. **Restore** clears only the current profile's color. **Clear tag** removes only the focused session's tag.
5. Select **Tagged sessions** in the sidebar to review tags across profiles. Filter by profile or tag, search the session title/preview/ID, or open a listed session.

## Technical notes and limitations

- **Hermes Desktop only.** It does not change classic terminal, Discord, Telegram, or web dashboard session lists.
- Requires a Hermes Desktop build with the SDK's `SESSION_ROW_AREAS`, `ROUTES_AREA`, `SIDEBAR_NAV_AREA`, `host.state.focusedStoredSessionId`, `host.sessions.setColor`, `host.profileRoutes`, `host.listPersistedSessions`, `host.openSession`, `ctx.storage`, and `setAccentOverride` APIs. These are described in the current [Desktop Plugin SDK](https://hermes-agent.nousresearch.com/docs/developer-guide/desktop-plugin-sdk). Compatibility with an installed Hermes version must be checked in the actual app.
- The SDK returns at most 500 persisted sessions per profile. When a tag assignment has no matching returned session details, Prisma keeps it visible by session ID; the assigned profile and title cannot be inferred until the session appears in the SDK results.
- The public plugin API cannot color the full session-row background. Prisma colors the emoji badge and the SDK's session color indicator instead.
- Applying a tag uses the SDK's per-session color override. It replaces any existing manual color override; clearing the tag returns the session to its inherited project color.
- The accent override is a **single app-wide value** owned by the SDK. Do not enable Prisma alongside **Accent Picker** or another plugin writing `setAccentOverride`: concurrent writes may overwrite each other.
- Stored color isolation uses the **active profile identifier** supplied by `host.state.profile`. Two unrelated remote Hermes gateways with exactly the same profile identifier may share the color in one app installation; the SDK does not provide a gateway identity in the profile atom.
- Tags reflect the **manually selected label**. They do not automatically track whether the agent is running, blocked, or finished.
- Tag definitions and assignments are stored locally in the desktop plugin's storage, scoped to its app instance. They do not sync to all devices, and are not guaranteed to be included in Hermes profile export/import. Existing emoji-only assignments are preserved until replaced or cleared, without an invented tag color.
- No Hermes source modifications, DOM scraping, external requests, additional packages, or file-system permissions are needed at runtime.
- Disabling Prisma clears tag-applied session color overrides, but preserves tags and assignments so re-enabling restores them.

## Validation

```sh
node --check desktop/plugin.js
node --experimental-vm-modules --test tests/plugin.test.mjs
```

These tests exercise the plugin module using an SDK test double. **They are not a replacement for installing and checking the plugin in a live Hermes Desktop build**.

## Distribution

`desktop/plugin.js` is the directly loadable single-file artifact. `plugin.yaml` provides catalog-style package metadata. To publish to the official plugin catalog, host the plugin in a versioned repository and follow Hermes's plugin review process.
