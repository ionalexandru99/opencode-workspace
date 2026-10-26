import { Plugin } from "@opencode/plugin/tui"
import { createInbox } from "./inbox/inbox.ts"
import { InboxSidebar } from "./inbox/sidebar.tsx"

export default Plugin.define({
  id: "inbox",
  setup(ctx) {
    const inbox = createInbox(ctx)
    const release = ctx.ui.slot({
      prepend: "sidebar.footer",
      render: (input) => <InboxSidebar inbox={inbox} sessionID={input.sessionID} />,
    })
    return () => {
      release()
      inbox.stop()
    }
  },
})
