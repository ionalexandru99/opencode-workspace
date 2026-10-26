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

- opencode 2.0.x (tested on 2.0.27)
- Node.js 22.18+ and npm, only for development

## Install

Clone the repository, then point a global opencode plugin at it:

```sh
git clone git@github.com:ionalexandru99/opencode-workspace.git ~/code/opencode-inbox
mkdir -p ~/.config/opencode/plugins/inbox
echo 'export { default } from "'"$HOME"'/code/opencode-inbox/src/tui.tsx"' \
  > ~/.config/opencode/plugins/inbox/tui.tsx
```

Restart opencode and open any session. The inbox appears in the right sidebar.

To update, run `git pull` in the clone and restart opencode. To uninstall, delete `~/.config/opencode/plugins/inbox`.

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
npm test
npm run typecheck
```

The dependencies are only for types and tests. At runtime opencode provides `solid-js`, `@opentui/*` and the plugin API.

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
