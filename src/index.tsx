/**
 * Open Agent Sidebar — plugin entry.
 *
 * Pure wiring only: create the subagent tracker, register the
 * `sidebar_content` slot (order 450), and wire the detail route plus
 * keymap layer via `registerDetail`. No business logic here.
 */
import type { TuiPlugin, TuiPluginModule } from "@opencode-ai/plugin/tui"
import { createTracker } from "./tracker"
import { createSidebar } from "./sidebar"
import { registerDetail } from "./detail"

const tui: TuiPlugin = async (api) => {
  const tracker = createTracker(api)

  api.slots.register({
    order: 450,
    slots: { sidebar_content: createSidebar(api, tracker) },
  })

  registerDetail(api, tracker)
}

const plugin: TuiPluginModule & { id: string } = {
  id: "open-agent-sidebar",
  tui,
}

export default plugin