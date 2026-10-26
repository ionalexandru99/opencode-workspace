// src/tui.tsx
import { createComponent as _$createComponent3 } from "@opentui/solid";
import { Plugin } from "@opencode/plugin/tui";

// src/inbox/model.ts
var isAsking = ({ signals }) => signals.approval || signals.input, finishedAfter = (entry, time = 0) => (entry.finished ?? 0) > time, failedSince = (entry, time) => entry.signals.failed && finishedAfter(entry, time), isSnoozed = (entry, now) => entry.mark.snoozedUntil !== void 0 && entry.mark.snoozedUntil > now && !isAsking(entry) && !failedSince(entry, entry.mark.snoozedAt), isSettled = (entry) => entry.mark.settledAt !== void 0 && !finishedAfter(entry, entry.mark.settledAt) && !isAsking(entry) && !entry.signals.running;
function statusOf(entry, now) {
  let { signals, mark } = entry;
  return signals.approval ? "approval" : signals.input ? "input" : signals.running ? "working" : signals.failed ? "failed" : mark.snoozedUntil !== void 0 && mark.snoozedUntil <= now ? "woke" : signals.unread ? "done" : "idle";
}
function sectionOf(entry, now) {
  return isSettled(entry) ? "settled" : isSnoozed(entry, now) ? "snoozed" : entry.signals.running && !isAsking(entry) ? "working" : entry.mark.pinned ? "pinned" : "active";
}
function groupSections(entries, now) {
  let sections = { pinned: [], active: [], working: [], snoozed: [], settled: [] };
  for (let entry of entries) sections[sectionOf(entry, now)].push(entry);
  for (let list of Object.values(sections)) list.sort((a, b) => b.updated - a.updated);
  return sections;
}
var SHELVES = ["working", "snoozed", "settled"], isCompact = (key) => key === "settled", sectionRows = (sections, key) => sections[key].length * (isCompact(key) ? 1 : 2);
function listRows(sections, collapsed) {
  let pinned = sections.pinned.length ? 1 + sectionRows(sections, "pinned") + 1 : 0, active = 1 + Math.max(1, sectionRows(sections, "active")), shelves = SHELVES.filter((key) => sections[key].length).reduce(
    (rows, key) => rows + 1 + (collapsed[key] ? 0 : sectionRows(sections, key)),
    0
  );
  return pinned + active + shelves;
}
var BUILT_IN_MIN_ROWS = 6, BUILT_IN_SHARE = 0.2;
function inboxRows(sharedRows) {
  let builtIn = Math.max(BUILT_IN_MIN_ROWS, Math.round(sharedRows * BUILT_IN_SHARE));
  return Math.max(0, sharedRows - builtIn);
}
function relativeTime(time, now) {
  let minutes = Math.floor((now - time) / 6e4);
  return minutes < 1 ? "now" : minutes < 60 ? `${minutes}m` : minutes < 1440 ? `${Math.round(minutes / 60)}h` : `${Math.round(minutes / 1440)}d`;
}
function untilLabel(time, now) {
  let until = new Date(time);
  return until.toDateString() === new Date(now).toDateString() ? until.toLocaleTimeString(void 0, { hour: "2-digit", minute: "2-digit", hour12: !1 }) : until.toLocaleDateString(void 0, { weekday: "short" });
}

// src/inbox/actions.ts
var HOUR = 36e5, tomorrowMorning = (now) => {
  let date = new Date(now);
  return date.setDate(date.getDate() + 1), date.setHours(9, 0, 0, 0), date.getTime();
};
async function showActions(ui, marks, entry) {
  let now = Date.now(), section = sectionOf(entry, now), snooze = section === "snoozed" ? [{ title: "Wake now", value: (at) => marks.snooze(entry.id, void 0, at) }] : [
    { title: "Snooze 1 hour", value: (at) => marks.snooze(entry.id, at + HOUR, at) },
    { title: "Snooze 4 hours", value: (at) => marks.snooze(entry.id, at + 4 * HOUR, at) },
    { title: "Snooze until tomorrow 09:00", value: (at) => marks.snooze(entry.id, tomorrowMorning(at), at) }
  ], options = [
    entry.mark.pinned ? { title: "Unpin", value: () => marks.pin(entry.id, !1) } : { title: "Pin", value: () => marks.pin(entry.id, !0) },
    ...snooze,
    section === "settled" ? { title: "Unsettle", value: () => marks.settle(entry.id, void 0) } : { title: "Settle", value: (at) => marks.settle(entry.id, at) }
  ];
  await (await ui.dialog.select({ title: entry.title, options }))?.(Date.now());
}

// src/inbox/entries.ts
var isUnread = ({ time }) => time.idle !== void 0 && time.idle > (time.viewed ?? 0);
function toEntries(snapshot, options) {
  let running = new Set(snapshot.running), approval = new Set(snapshot.approval), input = new Set(snapshot.input);
  return snapshot.sessions.map((session) => ({
    id: session.id,
    title: session.title ?? "Untitled session",
    project: options.projectOf(session),
    model: session.model?.id ?? snapshot.models[session.id],
    updated: session.time.updated,
    finished: session.time.idle,
    signals: {
      running: running.has(session.id),
      approval: approval.has(session.id),
      input: input.has(session.id),
      failed: session.outcome === "failed",
      unread: session.id !== options.currentID && isUnread(session)
    },
    mark: options.markOf(session.id)
  }));
}
function projectName(project, directory) {
  return project?.name ?? (project?.canonical ?? directory).split("/").filter(Boolean).at(-1) ?? directory;
}

// src/inbox/marks.ts
function createMarks(storage) {
  let [marks, update] = storage.store("marks", { initial: {} }), patch = (sessionID, change) => update((draft) => {
    draft[sessionID] = { ...draft[sessionID], ...change };
  });
  return {
    of: (sessionID) => marks[sessionID] ?? {},
    pin: (sessionID, pinned) => patch(sessionID, { pinned }),
    snooze: (sessionID, snoozedUntil, now) => patch(sessionID, { snoozedAt: snoozedUntil === void 0 ? void 0 : now, snoozedUntil, settledAt: void 0 }),
    settle: (sessionID, settledAt) => patch(sessionID, { settledAt, snoozedUntil: void 0, pinned: !1 })
  };
}

// src/inbox/source.ts
import { createStore, reconcile } from "solid-js/store";
var REFRESH_ON = [
  "session.created",
  "session.deleted",
  "session.renamed",
  "session.moved",
  "session.model.selected",
  "session.execution.started",
  "session.execution.succeeded",
  "session.execution.failed",
  "session.execution.interrupted",
  "session.idle",
  "session.viewed",
  "permission.asked",
  "permission.replied",
  "form.created",
  "form.replied",
  "form.cancelled"
], MODEL_CHANGED_ON = ["session.execution.started", "session.model.selected"], DEBOUNCE_MS = 250, SESSION_LIMIT = 100;
function createSessionSource(ctx) {
  let [snapshot, setSnapshot] = createStore({ sessions: [], models: {}, running: [], approval: [], input: [] }), models = /* @__PURE__ */ new Map(), timer, generation = 0;
  async function lastReplyModel(sessionID) {
    let reply = (await ctx.client.message.list({ sessionID, type: "assistant", limit: 1, order: "desc" }).catch(() => {
    }))?.data[0];
    return reply?.type === "assistant" ? reply.model.id : void 0;
  }
  let pendingLookups = {
    approval: (directory) => ctx.client.permission.request.list({ location: { directory } }),
    input: (directory) => ctx.client.form.list({ location: { directory } })
  };
  function previousPending(kind, directory) {
    let inDirectory = new Set(
      snapshot.sessions.filter((session) => session.location.directory === directory).map((session) => session.id)
    );
    return snapshot[kind].filter((sessionID) => inDirectory.has(sessionID));
  }
  async function pendingSessionIDs(kind, directories) {
    return (await Promise.all(
      directories.map(async (directory) => {
        try {
          return (await pendingLookups[kind](directory)).data.map((pending) => pending.sessionID);
        } catch (error) {
          return console.error(`inbox: failed to load ${kind} requests for ${directory}`, error), previousPending(kind, directory);
        }
      })
    )).flat();
  }
  async function lookupModels(sessions) {
    let missing = sessions.filter((session) => !session.model && !models.has(session.id));
    return Promise.all(missing.map(async (session) => [session.id, await lastReplyModel(session.id)]));
  }
  async function load() {
    let current = ++generation, [list, active] = await Promise.all([
      ctx.client.session.list({ limit: SESSION_LIMIT, order: "desc", parentID: null }),
      ctx.client.session.active()
    ]), sessions = list.data.filter((session) => !session.parentID && !session.time.archived), directories = [...new Set(sessions.map((session) => session.location.directory))], [approval, input, found] = await Promise.all([
      pendingSessionIDs("approval", directories),
      pendingSessionIDs("input", directories),
      lookupModels(sessions)
    ]);
    if (current === generation) {
      for (let [sessionID, model] of found) model && models.set(sessionID, model);
      setSnapshot(
        reconcile({
          sessions,
          models: Object.fromEntries(models),
          running: Object.keys(active),
          approval,
          input
        })
      );
    }
  }
  let refresh = () => {
    clearTimeout(timer), timer = setTimeout(() => load().catch((error) => console.error("inbox: failed to load sessions", error)), DEBOUNCE_MS);
  }, unsubscribe = [
    ...MODEL_CHANGED_ON.map(
      (type) => ctx.data.on(type, (event) => {
        generation++, models.delete(event.data.sessionID);
      })
    ),
    ...REFRESH_ON.map((type) => ctx.data.on(type, refresh))
  ];
  return refresh(), {
    snapshot,
    stop() {
      clearTimeout(timer), unsubscribe.forEach((off) => off());
    }
  };
}

// src/inbox/inbox.ts
function createInbox(ctx) {
  let source = createSessionSource(ctx), marks = createMarks(ctx.storage), [collapsed, updateCollapsed] = ctx.storage.store("collapsed", {
    initial: { working: !1, snoozed: !0, settled: !0 }
  });
  return {
    theme: ctx.theme,
    renderer: ctx.renderer,
    collapsed,
    toggle: (key) => updateCollapsed((draft) => {
      draft[key] = !draft[key];
    }),
    entries: (currentID) => toEntries(source.snapshot, {
      currentID,
      markOf: marks.of,
      projectOf: (session) => projectName(ctx.data.project.get(session.projectID), session.location.directory)
    }),
    open(entry, now) {
      statusOf(entry, now) === "woke" && marks.snooze(entry.id, void 0, now), ctx.ui.router.navigate({ type: "session", sessionID: entry.id });
    },
    actions: (entry) => showActions(ctx.ui, marks, entry),
    stop: source.stop
  };
}

// src/inbox/sidebar.tsx
import { insert as _$insert2 } from "@opentui/solid";
import { memo as _$memo2 } from "@opentui/solid";
import { effect as _$effect2 } from "@opentui/solid";
import { createTextNode as _$createTextNode2 } from "@opentui/solid";
import { insertNode as _$insertNode2 } from "@opentui/solid";
import { setProp as _$setProp2 } from "@opentui/solid";
import { use as _$use } from "@opentui/solid";
import { createElement as _$createElement2 } from "@opentui/solid";
import { createComponent as _$createComponent2 } from "@opentui/solid";
import { createMemo as createMemo2, createSignal as createSignal2, For, onCleanup, Show as Show2 } from "solid-js";

// src/inbox/row.tsx
import { createTextNode as _$createTextNode } from "@opentui/solid";
import { effect as _$effect } from "@opentui/solid";
import { insertNode as _$insertNode } from "@opentui/solid";
import { createComponent as _$createComponent } from "@opentui/solid";
import "@opentui/solid";
import { insert as _$insert } from "@opentui/solid";
import { setProp as _$setProp } from "@opentui/solid";
import { createElement as _$createElement } from "@opentui/solid";
import { createMemo, createSignal, Show } from "solid-js";
var RIGHT_BUTTON = 2, GLYPH = {
  working: "\u25D0",
  approval: "!",
  input: "?",
  failed: "\u2715",
  woke: "\u21BA",
  done: "\u25CF",
  idle: "\xB7"
}, LABEL = {
  working: "Working",
  approval: "Approval",
  input: "Input",
  failed: "Failed",
  woke: "Woke",
  done: "Done",
  idle: ""
}, color = (theme, status) => ({
  working: theme.text.feedback.info.base,
  approval: theme.text.feedback.warning.base,
  input: theme.hue.accent[500],
  failed: theme.text.feedback.error.base,
  woke: theme.text.feedback.warning.base,
  done: theme.text.feedback.success.base,
  idle: theme.text.muted
})[status];
function Row(props) {
  let [hovered, setHovered] = createSignal(!1), status = createMemo(() => statusOf(props.entry, props.now)), tint = () => color(props.theme, status()), when = () => {
    let until = props.entry.mark.snoozedUntil;
    return until !== void 0 && until > props.now ? untilLabel(until, props.now) : relativeTime(props.entry.updated, props.now);
  }, background = () => props.current ? props.theme.background.raised.max : hovered() ? props.theme.background.raised.high : void 0;
  return (() => {
    var _el$ = _$createElement("box"), _el$2 = _$createElement("box"), _el$3 = _$createElement("text"), _el$4 = _$createElement("text"), _el$6 = _$createElement("text");
    return _$insertNode(_el$, _el$2), _$setProp(_el$, "onMouseOver", () => setHovered(!0)), _$setProp(_el$, "onMouseOut", () => setHovered(!1)), _$setProp(_el$, "onMouseUp", (event) => event.button === RIGHT_BUTTON ? props.onActions() : props.onOpen()), _$insertNode(_el$2, _el$3), _$insertNode(_el$2, _el$4), _$insertNode(_el$2, _el$6), _$setProp(_el$2, "flexDirection", "row"), _$setProp(_el$2, "gap", 1), _$setProp(_el$3, "flexShrink", 0), _$insert(_el$3, () => GLYPH[status()]), _$setProp(_el$4, "wrapMode", "none"), _$setProp(_el$4, "truncate", !0), _$setProp(_el$4, "flexGrow", 1), _$setProp(_el$4, "flexShrink", 1), _$setProp(_el$4, "minWidth", 0), _$insert(_el$4, _$createComponent(Show, {
      get when() {
        return status() === "done" || status() === "woke";
      },
      get fallback() {
        return props.entry.title;
      },
      get children() {
        var _el$5 = _$createElement("b");
        return _$insert(_el$5, () => props.entry.title), _el$5;
      }
    })), _$setProp(_el$6, "flexShrink", 0), _$insert(_el$6, when), _$insert(_el$, _$createComponent(Show, {
      get when() {
        return !props.compact;
      },
      get children() {
        var _el$7 = _$createElement("box"), _el$8 = _$createElement("text"), _el$9 = _$createElement("box");
        return _$insertNode(_el$7, _el$8), _$insertNode(_el$7, _el$9), _$setProp(_el$7, "flexDirection", "row"), _$setProp(_el$7, "paddingLeft", 2), _$setProp(_el$7, "gap", 1), _$setProp(_el$8, "wrapMode", "none"), _$setProp(_el$8, "truncate", !0), _$setProp(_el$8, "flexShrink", 4), _$setProp(_el$8, "minWidth", 0), _$insert(_el$8, () => props.entry.project), _$insert(_el$7, _$createComponent(Show, {
          get when() {
            return props.entry.model;
          },
          children: (model) => (() => {
            var _el$1 = _$createElement("text"), _el$10 = _$createTextNode("\xB7 ");
            return _$insertNode(_el$1, _el$10), _$setProp(_el$1, "wrapMode", "none"), _$setProp(_el$1, "truncate", !0), _$setProp(_el$1, "flexShrink", 1), _$setProp(_el$1, "minWidth", 0), _$insert(_el$1, model, null), _$effect((_$p) => _$setProp(_el$1, "fg", props.theme.text.muted, _$p)), _el$1;
          })()
        }), _el$9), _$setProp(_el$9, "flexGrow", 1), _$insert(_el$7, _$createComponent(Show, {
          get when() {
            return LABEL[status()];
          },
          get children() {
            var _el$0 = _$createElement("text");
            return _$setProp(_el$0, "flexShrink", 0), _$insert(_el$0, () => LABEL[status()]), _$effect((_$p) => _$setProp(_el$0, "fg", tint(), _$p)), _el$0;
          }
        }), null), _$effect((_$p) => _$setProp(_el$8, "fg", props.theme.text.muted, _$p)), _el$7;
      }
    }), null), _$effect((_p$) => {
      var _v$ = background(), _v$2 = tint(), _v$3 = props.theme.text.base, _v$4 = props.theme.text.muted;
      return _v$ !== _p$.e && (_p$.e = _$setProp(_el$, "backgroundColor", _v$, _p$.e)), _v$2 !== _p$.t && (_p$.t = _$setProp(_el$3, "fg", _v$2, _p$.t)), _v$3 !== _p$.a && (_p$.a = _$setProp(_el$4, "fg", _v$3, _p$.a)), _v$4 !== _p$.o && (_p$.o = _$setProp(_el$6, "fg", _v$4, _p$.o)), _p$;
    }, {
      e: void 0,
      t: void 0,
      a: void 0,
      o: void 0
    }), _el$;
  })();
}

// src/inbox/sidebar.tsx
var CLOCK_MS = 3e4, SHELF_TITLE = {
  working: "Working",
  snoozed: "Snoozed",
  settled: "Settled"
};
function useNow() {
  let [now, setNow] = createSignal2(Date.now()), timer = setInterval(() => setNow(Date.now()), CLOCK_MS);
  return onCleanup(() => clearInterval(timer)), now;
}
function useSharedRows(renderer, frame) {
  let [rows, setRows] = createSignal2(0), measure = () => {
    let inbox = frame(), footer = inbox?.parent, siblings = footer?.parent?.getChildren() ?? [], builtIn = footer ? siblings[siblings.indexOf(footer) - 1] : void 0;
    if (!inbox || !builtIn) return;
    let shared = builtIn.height + inbox.height;
    shared !== rows() && setRows(shared);
  };
  return renderer.addPostProcessFn(measure), onCleanup(() => renderer.removePostProcessFn(measure)), rows;
}
function InboxSidebar(props) {
  let theme = props.inbox.theme, [frame, setFrame] = createSignal2(), sharedRows = useSharedRows(props.inbox.renderer, frame), now = useNow(), sections = createMemo2(() => groupSections(props.inbox.entries(props.sessionID), now())), height = () => inboxRows(sharedRows()), spacer = () => Math.max(1, height() - listRows(sections(), props.inbox.collapsed)), rows = (key) => _$createComponent2(For, {
    get each() {
      return sections()[key];
    },
    children: (entry) => _$createComponent2(Row, {
      theme,
      entry,
      get now() {
        return now();
      },
      get current() {
        return entry.id === props.sessionID;
      },
      get compact() {
        return isCompact(key);
      },
      onOpen: () => props.inbox.open(entry, now()),
      onActions: () => {
        props.inbox.actions(entry);
      }
    })
  });
  return (() => {
    var _el$ = _$createElement2("scrollbox"), _el$2 = _$createElement2("box"), _el$7 = _$createElement2("text"), _el$8 = _$createElement2("b"), _el$0 = _$createElement2("box");
    return _$insertNode2(_el$, _el$2), _$use(setFrame, _el$), _$setProp2(_el$, "flexShrink", 0), _$setProp2(_el$, "horizontalScrollbarOptions", {
      visible: !1
    }), _$insertNode2(_el$2, _el$7), _$insertNode2(_el$2, _el$0), _$setProp2(_el$2, "flexShrink", 0), _$setProp2(_el$2, "paddingRight", 1), _$insert2(_el$2, _$createComponent2(Show2, {
      get when() {
        return sections().pinned.length;
      },
      get children() {
        return [(() => {
          var _el$3 = _$createElement2("text"), _el$4 = _$createElement2("b");
          return _$insertNode2(_el$3, _el$4), _$insertNode2(_el$4, _$createTextNode2("Pinned")), _$effect2((_$p) => _$setProp2(_el$3, "fg", theme.text.base, _$p)), _el$3;
        })(), _$memo2(() => rows("pinned")), (() => {
          var _el$6 = _$createElement2("box");
          return _$setProp2(_el$6, "height", 1), _el$6;
        })()];
      }
    }), _el$7), _$insertNode2(_el$7, _el$8), _$insertNode2(_el$8, _$createTextNode2("Active")), _$insert2(_el$2, _$createComponent2(Show2, {
      get when() {
        return sections().active.length;
      },
      get fallback() {
        return (() => {
          var _el$1 = _$createElement2("text");
          return _$insertNode2(_el$1, _$createTextNode2("Nothing waiting on you")), _$effect2((_$p) => _$setProp2(_el$1, "fg", theme.text.muted, _$p)), _el$1;
        })();
      },
      get children() {
        return rows("active");
      }
    }), _el$0), _$setProp2(_el$0, "flexShrink", 0), _$insert2(_el$2, _$createComponent2(For, {
      get each() {
        return SHELVES.filter((key) => sections()[key].length);
      },
      children: (key) => [(() => {
        var _el$11 = _$createElement2("box"), _el$12 = _$createElement2("text"), _el$13 = _$createElement2("text"), _el$14 = _$createElement2("b");
        return _$insertNode2(_el$11, _el$12), _$insertNode2(_el$11, _el$13), _$setProp2(_el$11, "flexDirection", "row"), _$setProp2(_el$11, "gap", 1), _$setProp2(_el$11, "onMouseUp", () => {
          props.inbox.toggle(key);
        }), _$insert2(_el$12, () => props.inbox.collapsed[key] ? "\u25B6" : "\u25BC"), _$insertNode2(_el$13, _el$14), _$insert2(_el$14, () => SHELF_TITLE[key]), _$insert2(_el$13, _$createComponent2(Show2, {
          get when() {
            return props.inbox.collapsed[key];
          },
          get children() {
            var _el$15 = _$createElement2("span"), _el$16 = _$createTextNode2(" ("), _el$17 = _$createTextNode2(")");
            return _$insertNode2(_el$15, _el$16), _$insertNode2(_el$15, _el$17), _$insert2(_el$15, () => sections()[key].length, _el$17), _$effect2((_$p) => _$setProp2(_el$15, "style", {
              fg: theme.text.muted
            }, _$p)), _el$15;
          }
        }), null), _$effect2((_p$) => {
          var _v$5 = theme.text.base, _v$6 = theme.text.base;
          return _v$5 !== _p$.e && (_p$.e = _$setProp2(_el$12, "fg", _v$5, _p$.e)), _v$6 !== _p$.t && (_p$.t = _$setProp2(_el$13, "fg", _v$6, _p$.t)), _p$;
        }, {
          e: void 0,
          t: void 0
        }), _el$11;
      })(), _$createComponent2(Show2, {
        get when() {
          return !props.inbox.collapsed[key];
        },
        get children() {
          return rows(key);
        }
      })]
    }), null), _$effect2((_p$) => {
      var _v$ = height(), _v$2 = {
        position: "absolute",
        right: 0,
        top: 0,
        width: 1,
        height: "100%",
        trackOptions: {
          backgroundColor: theme.background.raised.base,
          foregroundColor: theme.scrollbar.base
        }
      }, _v$3 = theme.text.base, _v$4 = spacer();
      return _v$ !== _p$.e && (_p$.e = _$setProp2(_el$, "height", _v$, _p$.e)), _v$2 !== _p$.t && (_p$.t = _$setProp2(_el$, "verticalScrollbarOptions", _v$2, _p$.t)), _v$3 !== _p$.a && (_p$.a = _$setProp2(_el$7, "fg", _v$3, _p$.a)), _v$4 !== _p$.o && (_p$.o = _$setProp2(_el$0, "height", _v$4, _p$.o)), _p$;
    }, {
      e: void 0,
      t: void 0,
      a: void 0,
      o: void 0
    }), _el$;
  })();
}

// src/tui.tsx
var tui_default = Plugin.define({
  id: "inbox",
  setup(ctx) {
    let inbox = createInbox(ctx), release = ctx.ui.slot({
      prepend: "sidebar.footer",
      render: (input) => _$createComponent3(InboxSidebar, {
        inbox,
        get sessionID() {
          return input.sessionID;
        }
      })
    });
    return () => {
      release(), inbox.stop();
    };
  }
});
export {
  tui_default as default
};
