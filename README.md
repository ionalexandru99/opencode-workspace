<img src="assets/icon.svg" width="64" height="64" alt="">

# opencode inbox

An inbox for the opencode TUI. It lists the sessions from all your projects in the right sidebar, so you can see which ones need you without switching around.

```
┌ chat ─────────────────────────────┬ #132 Admin sign-in (WorkOS) ──┐
│                                   │ Context                       │
│                                   │ 48,210 tokens                 │
│                                   │ 24% used                      │
│                                   │                               │
│                                   │ Pinned                        │
│                                   │ ● Storefront design mocks  9m │
│                                   │   alfastar · opus-5.5    Done │
│                                   │ Active                        │
│                                   │ ! #147 Language by country 3m │
│                                   │   alfastar · opus-5.5 Approval│
│                                   │ ? 📬 Life admin           now │
│                                   │   assistant · sol-6.1   Input │
│                                   │                               │
│                                   │ ▼ Working                     │
│                                   │ ◐ DNS over Tailscale      now │
│                                   │   assistant · opus-5.5 Working│
│                                   │ ▶ Snoozed (1)                 │
│                                   │ ▶ Settled (14)                │
└───────────────────────────────────┴───────────────────────────────┘
```

The built-in sidebar sections stay at the top. The inbox takes the remaining 80% of the panel.

## Requirements

- opencode 2.1.4 or newer
- Node.js 22.18+ and npm, only for development

## Install

Install globally with one command:

```sh
opencode plugin add github:ionalexandru99/opencode-workspace
```

Open any session. The inbox appears in the right sidebar; run `/reload` if it is not visible yet. No clone, Node.js installation or build step is needed.

To update:

```sh
opencode plugin update github:ionalexandru99/opencode-workspace
```

To uninstall:

```sh
opencode plugin remove github:ionalexandru99/opencode-workspace
```

## Using it

- **Click** a session to open it. Sessions from other projects open too.
- **Right-click** a session to pin, snooze or settle it.
- **Click** a section header (Working, Snoozed, Settled) to expand or collapse it.

| Mark | Status   | Meaning                                    |
| ---- | -------- | ------------------------------------------ |
| `!`  | Approval | Waiting for you to allow a tool            |
| `?`  | Input    | Waiting for you to answer a question       |
| `✕`  | Failed   | The last run failed                        |
| `◐`  | Working  | Running right now                          |
| `●`  | Done     | Finished since you last looked             |
| `↺`  | Woke     | Snooze ran out                             |
| `·`  |          | Nothing new                                |

Snoozed and settled sessions come back on their own when they need you or have new activity. Pins, snoozes and settles are saved and shared between open opencode windows.

opencode only shows the right sidebar by itself when the terminal is wider than 120 columns. On smaller terminals, toggle it with the sidebar command (`ctrl+p` → "Show sidebar").

## Development

```sh
npm install
npm run bundle
npm test
npm run typecheck
```

Commit `dist/tui.js` after source changes. OpenCode skips package install scripts, so Git installations use this precompiled bundle. The build leaves `solid-js`, `@opentui/*` and the plugin API external; opencode provides them at runtime.

To verify the packaged Git installation in an isolated opencode TUI, run `npm run test:install` (requires opencode, Git and Python 3 on macOS or Linux).

```
src/
  tui.tsx            plugin entry, claims the sidebar slot
  inbox/
    model.ts         statuses, sections and layout rules
    entries.ts       opencode sessions → inbox entries
    source.ts        loads sessions and refreshes on events
    marks.ts         saved pins, snoozes and settles
    actions.ts       right-click menu
    sidebar.tsx      sidebar layout
    row.tsx          two-line session row
```

## Known limits

- Only the 100 most recent sessions are loaded.
- A permission request inside a subagent does not flag its parent session yet.
- Pin, snooze and settle are mouse-only.
