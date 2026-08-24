/**
 * Open a tracked subagent in the host's native session view.
 *
 * Keeps the picker (toast / single-open / DialogSelect) and delegates
 * display to `client.tui.selectSession` so the user stays on the host
 * navigation stack and can go back.
 */
import type { TuiPluginApi } from "@opencode-ai/plugin/tui"
import { buildTree, type TreeNode } from "./tree"
import { applyHostStatus } from "./tracker-handlers"
import { isActiveStatus, type SubagentNode } from "./types"
import type { Tracker } from "./tracker"
import type { SessionStatus } from "@opencode-ai/sdk/v2"

const OPEN_COMMAND = "agent_sidebar.open"

/** Flatten a tree into its nodes, depth-first. */
function flattenTree(tree: TreeNode[]): SubagentNode[] {
  const flat: SubagentNode[] = []
  for (const item of tree) {
    flat.push(item.node)
    flat.push(...flattenTree(item.children))
  }
  return flat
}

/** Nodes for the picker: same filter as the sidebar (active only, current root). */
export function pickerNodes(
  tracker: Tracker,
  statusOf?: (sessionID: string) => SessionStatus | undefined,
): SubagentNode[] {
  const nodes = Object.values(tracker.nodes).map((node) =>
    statusOf === undefined ? node : applyHostStatus(node, statusOf(node.sessionID)),
  )
  const rootID = tracker.currentRoot?.()
  if (rootID === undefined) return nodes.filter((node) => isActiveStatus(node.status))
  return flattenTree(buildTree(nodes, rootID))
}

/** Ask the host TUI to show the native session view for this subagent. */
export function openSession(api: TuiPluginApi, sessionID: string): void {
  void api.client.tui
    .selectSession({ sessionID })
    .then((result) => {
      if (result.error) {
        api.ui.toast({ message: "Could not open subagent", variant: "error" })
      }
    })
    .catch(() => {
      api.ui.toast({ message: "Could not open subagent", variant: "error" })
    })
}

function openSubagent(api: TuiPluginApi, tracker: Tracker): void {
  const nodes = pickerNodes(tracker, (sessionID) => api.state.session.status(sessionID))
  if (nodes.length === 0) {
    api.ui.toast({ message: "No subagents", variant: "info" })
    return
  }
  if (nodes.length === 1) {
    const soleNode = nodes[0]
    if (soleNode !== undefined) {
      openSession(api, soleNode.sessionID)
    }
    return
  }
  api.ui.dialog.replace(() =>
    api.ui.DialogSelect({
      title: "Subagents",
      options: nodes.map((node) => ({
        title: `${node.agent} — ${node.description}`,
        value: node.sessionID,
        description: node.status,
      })),
      onSelect: (option) => {
        api.ui.dialog.clear()
        openSession(api, option.value)
      },
    }),
  )
}

/** Register the palette command, slash command, and keybind. */
export function registerOpen(api: TuiPluginApi, tracker: Tracker): void {
  const offLayer = api.keymap.registerLayer({
    commands: [
      {
        name: OPEN_COMMAND,
        run: () => openSubagent(api, tracker),
        title: "Subagents: Open native session",
        category: "Plugin",
        namespace: "palette",
        slashName: "agents",
      },
    ],
    bindings: [{ key: "ctrl+shift+a", cmd: OPEN_COMMAND, desc: "Open subagent session" }],
  })
  api.lifecycle.onDispose(offLayer)
}
