import type { Plugin } from "@opencode/plugin/tui"
import { createMemo, createSignal, Show } from "solid-js"
import { relativeTime, statusOf, untilLabel, type Entry, type Status } from "./model.ts"

type Theme = Plugin.Context["theme"]

const RIGHT_BUTTON = 2

const GLYPH: Record<Status, string> = {
  working: "◐",
  approval: "!",
  input: "?",
  failed: "✕",
  woke: "↺",
  done: "●",
  idle: "·",
}

const LABEL: Record<Status, string> = {
  working: "Working",
  approval: "Approval",
  input: "Input",
  failed: "Failed",
  woke: "Woke",
  done: "Done",
  idle: "",
}

const color = (theme: Theme, status: Status) =>
  ({
    working: theme.text.feedback.info.base,
    approval: theme.text.feedback.warning.base,
    input: theme.hue.accent[500],
    failed: theme.text.feedback.error.base,
    woke: theme.text.feedback.warning.base,
    done: theme.text.feedback.success.base,
    idle: theme.text.muted,
  })[status]

export function Row(props: {
  readonly theme: Theme
  readonly entry: Entry
  readonly now: number
  readonly current: boolean
  readonly onOpen: () => void
  readonly onActions: () => void
}) {
  const [hovered, setHovered] = createSignal(false)
  const status = createMemo(() => statusOf(props.entry, props.now))
  const tint = () => color(props.theme, status())
  const when = () => {
    const until = props.entry.mark.snoozedUntil
    return until !== undefined && until > props.now ? untilLabel(until, props.now) : relativeTime(props.entry.updated, props.now)
  }
  const background = () =>
    props.current ? props.theme.background.raised.max : hovered() ? props.theme.background.raised.high : undefined

  return (
    <box
      backgroundColor={background()}
      onMouseOver={() => setHovered(true)}
      onMouseOut={() => setHovered(false)}
      onMouseUp={(event) => (event.button === RIGHT_BUTTON ? props.onActions() : props.onOpen())}
    >
      <box flexDirection="row" gap={1}>
        <text flexShrink={0} fg={tint()}>
          {GLYPH[status()]}
        </text>
        <text fg={props.theme.text.base} wrapMode="none" truncate flexGrow={1} flexShrink={1} minWidth={0}>
          <Show when={status() === "done" || status() === "woke"} fallback={props.entry.title}>
            <b>{props.entry.title}</b>
          </Show>
        </text>
        <text flexShrink={0} fg={props.theme.text.muted}>
          {when()}
        </text>
      </box>
      <box flexDirection="row" paddingLeft={2} gap={1}>
        <text fg={props.theme.text.muted} wrapMode="none" truncate flexShrink={1} minWidth={0}>
          {props.entry.project}
        </text>
        <Show when={props.entry.model}>
          {(model) => (
            <text flexShrink={0} fg={props.theme.text.muted}>
              · {model()}
            </text>
          )}
        </Show>
        <box flexGrow={1} />
        <Show when={LABEL[status()]}>
          <text flexShrink={0} fg={tint()}>
            {LABEL[status()]}
          </text>
        </Show>
      </box>
    </box>
  )
}
