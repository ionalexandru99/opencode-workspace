import type { CliRenderer, Renderable } from "@opentui/core"
import { createMemo, createSignal, For, onCleanup, Show } from "solid-js"
import type { Inbox } from "./inbox.ts"
import { groupSections, inboxRows, listRows, SHELVES, type Entry, type ShelfKey } from "./model.ts"
import { Row } from "./row.tsx"

const CLOCK_MS = 30_000

const SHELF_TITLE: Record<ShelfKey, string> = { working: "Working", snoozed: "Snoozed", settled: "Settled" }

function useNow() {
  const [now, setNow] = createSignal(Date.now())
  const timer = setInterval(() => setNow(Date.now()), CLOCK_MS)
  onCleanup(() => clearInterval(timer))
  return now
}

function useSharedRows(renderer: CliRenderer, frame: () => Renderable | undefined) {
  const [rows, setRows] = createSignal(0)
  const measure = () => {
    const inbox = frame()
    const footer = inbox?.parent
    const siblings = footer?.parent?.getChildren() ?? []
    const builtIn = footer ? siblings[siblings.indexOf(footer) - 1] : undefined
    if (!inbox || !builtIn) return
    const shared = builtIn.height + inbox.height
    if (shared !== rows()) setRows(shared)
  }
  renderer.addPostProcessFn(measure)
  onCleanup(() => renderer.removePostProcessFn(measure))
  return rows
}

export function InboxSidebar(props: { readonly inbox: Inbox; readonly sessionID: string }) {
  const theme = props.inbox.theme
  const [frame, setFrame] = createSignal<Renderable>()
  const sharedRows = useSharedRows(props.inbox.renderer, frame)
  const now = useNow()
  const sections = createMemo(() => groupSections(props.inbox.entries(props.sessionID), now()))
  const height = () => inboxRows(sharedRows())
  const spacer = () => Math.max(1, height() - listRows(sections(), props.inbox.collapsed))

  const rows = (entries: Entry[]) => (
    <For each={entries}>
      {(entry) => (
        <Row
          theme={theme}
          entry={entry}
          now={now()}
          current={entry.id === props.sessionID}
          onOpen={() => props.inbox.open(entry, now())}
          onActions={() => void props.inbox.actions(entry)}
        />
      )}
    </For>
  )

  return (
    <scrollbox
      ref={setFrame}
      height={height()}
      flexShrink={0}
      horizontalScrollbarOptions={{ visible: false }}
      verticalScrollbarOptions={{
        position: "absolute",
        right: 0,
        top: 0,
        width: 1,
        height: "100%",
        trackOptions: { backgroundColor: theme.background.raised.base, foregroundColor: theme.scrollbar.base },
      }}
    >
      <box flexShrink={0} paddingRight={1}>
        <Show when={sections().pinned.length}>
          <text fg={theme.text.base}>
            <b>Pinned</b>
          </text>
          {rows(sections().pinned)}
          <box height={1} />
        </Show>
        <text fg={theme.text.base}>
          <b>Active</b>
        </text>
        <Show when={sections().active.length} fallback={<text fg={theme.text.muted}>Nothing waiting on you</text>}>
          {rows(sections().active)}
        </Show>
        <box height={spacer()} flexShrink={0} />
        <For each={SHELVES.filter((key) => sections()[key].length)}>
          {(key) => (
            <>
              <box flexDirection="row" gap={1} onMouseUp={() => void props.inbox.toggle(key)}>
                <text fg={theme.text.base}>{props.inbox.collapsed[key] ? "▶" : "▼"}</text>
                <text fg={theme.text.base}>
                  <b>{SHELF_TITLE[key]}</b>
                  <Show when={props.inbox.collapsed[key]}>
                    <span style={{ fg: theme.text.muted }}> ({sections()[key].length})</span>
                  </Show>
                </text>
              </box>
              <Show when={!props.inbox.collapsed[key]}>{rows(sections()[key])}</Show>
            </>
          )}
        </For>
      </box>
    </scrollbox>
  )
}
