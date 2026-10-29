# Prisma usage guide

Prisma adds profile-specific accent colors and custom session tags to Hermes Desktop. This guide covers installation, everyday use, storage, and compatibility.

## Install

From the repository root, copy the single-file plugin into Hermes Desktop's plugin directory:

```sh
plugin_dir="${HERMES_HOME:-$HOME/.hermes}/desktop-plugins/prisma"
mkdir -p "$plugin_dir"
cp desktop/plugin.js "$plugin_dir/plugin.js"
```

Enable **Prisma** under **Capabilities → Plugins**. The app watches desktop plugins; if Prisma does not appear, use **Command Center → Reload desktop plugins**.

## Use Prisma

### Choose an accent color

Open the **Prisma** control in the status bar, then use the native color picker, enter a hexadecimal color, or choose one of ten preset swatches. Colors are saved per active profile and restored when you switch profiles. Prisma previews the accent and a darker app/sidebar background without replacing the committed theme. **Restore** clears only the current profile's Prisma color.

### Create and assign tags

Open Prisma from the status bar or **Settings → Plugins → Prisma**. Create a tag with a name, emoji, and color. Use **+** in a session row to assign one tag; choosing another replaces it. **Clear tag** removes the focused session's tag. Existing tags can be edited or deleted from Prisma controls; deleting a tag requires confirmation and clears its assignments and color overrides. Tags remain manageable when no session is open, but assignment requires a selected session.

### Browse tagged sessions

Choose **Tagged sessions** in the sidebar to see active tagged sessions across profiles. Filter by profile or tag, search by title/preview/ID, and open a session directly. Drag a card to another column to change its tag; use its tag selector as an alternative. Reorder columns by dragging their handles or using the arrow buttons; the order is saved.

Archived sessions are excluded. Assignments without returned active session details are also hidden because the SDK does not distinguish archived sessions from other unavailable assignments. The SDK returns at most 500 non-archived sessions per profile, so tagged sessions beyond that page may be omitted.

## Storage and compatibility

- Prisma is for Hermes Desktop; it does not change session lists in the terminal, messaging apps, or web dashboard.
- Tag definitions and assignments are saved in desktop plugin storage for that app instance. They do not sync across devices and may not be included in profile export/import. Legacy emoji-only assignments are retained until replaced or cleared.
- Session annotations use stored/durable session IDs so they survive session-ID rotations caused by context compression.
- Disabling Prisma clears tag-applied session color overrides but preserves tags and assignments for later re-enabling.
- Applying a tag uses the SDK's per-session color override, replacing any existing manual color override. Clearing the tag returns the session to its inherited project color.
- The public plugin API cannot color the full session-row background; Prisma styles the emoji badge and session color indicator instead.
- The accent override is one app-wide value. Do not use Prisma alongside another plugin that writes `setAccentOverride`, such as Accent Picker, because their updates can overwrite one another.
- Color storage is keyed by the active profile identifier. Two unrelated gateways with the same profile identifier may share a color because the SDK does not expose gateway identity in the profile atom.
- Tags are labels chosen by the user; they do not track whether an agent is running, blocked, or finished.
- Prisma requires the SDK APIs listed in the [Hermes Desktop Plugin SDK](https://hermes-agent.nousresearch.com/docs/developer-guide/desktop-plugin-sdk): `SESSION_ROW_AREAS`, `ROUTES_AREA`, `SIDEBAR_NAV_AREA`, `host.state.focusedStoredSessionId`, `host.sessions.setColor`, `host.profileRoutes`, `host.listPersistedSessions`, `host.openSession`, `ctx.storage`, and `setAccentOverride`. Check compatibility in the actual Hermes Desktop build.

## Test and distribution

Run the same checks used by CI:

```sh
node --check desktop/plugin.js
node --experimental-vm-modules --test tests/plugin.test.mjs
```

The tests use an SDK test double; they do not replace checking the plugin in a live Hermes Desktop build. `desktop/plugin.js` is the directly loadable single-file plugin. Follow Hermes's plugin review process before submitting it to the official catalog.
