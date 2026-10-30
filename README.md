# Prisma

[![CI](https://github.com/MarcosAlves90/prisma/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/MarcosAlves90/prisma/actions/workflows/ci.yml)

![Prisma plugin cover](assets/prisma-cover.png)

**A focused plugin for Hermes Desktop:** personalize profiles with accent colors and organize tagged sessions in a cross-profile kanban.

## Highlights

- Persistent accent colors per profile, with a live preview that respects the committed theme.
- Custom colored emoji tags for sessions, with accessible controls to create, edit, assign, and remove tags.
- A **Tagged sessions** kanban with profile/tag filters, search, drag-and-drop, and persistent column order.
- Local plugin storage; no extra runtime dependencies or direct network access.
- **Disclosure:** the cross-profile sessions board reads registered profile routes and persisted session titles, previews, and IDs through the Hermes Desktop SDK. Prisma makes no direct network calls, does not launch shell commands or background processes, and does not store credentials or telemetry.

## Install

From the repository root, copy the plugin into Hermes Desktop's plugin directory:

```sh
plugin_dir="${HERMES_HOME:-$HOME/.hermes}/desktop-plugins/prisma"
mkdir -p "$plugin_dir"
cp desktop/plugin.js "$plugin_dir/plugin.js"
```

Then enable **Prisma** under **Capabilities → Plugins**. If it does not appear, use **Command Center → Reload desktop plugins**.

## Develop

```sh
node --check desktop/plugin.js
node --experimental-vm-modules --test tests/plugin.test.mjs
```

GitHub Actions runs these checks for pushes and pull requests targeting `main`.

## Documentation

See the [usage and compatibility guide](docs/usage.md) for setup, workflows, storage behavior, and limitations. For the host APIs, see the [Hermes Desktop Plugin SDK](https://hermes-agent.nousresearch.com/docs/developer-guide/desktop-plugin-sdk).
