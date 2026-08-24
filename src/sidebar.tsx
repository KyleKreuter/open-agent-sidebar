/** @jsxImportSource @opentui/solid */
/**
 * Sidebar UI for the open-agent-sidebar plugin.
 *
 * Renders the live subagent tree (built from tracker state via buildTree)
 * into the host-provided `sidebar_content` slot. A click opens the native
 * session view via `client.tui.selectSession`.
 */
import { For, Show } from "solid-js"
import type { TuiPluginApi, TuiSlotContext, TuiThemeCurrent } from "@opencode-ai/plugin/tui"
import { openSession } from "./detail"
import { statusIcon } from "./format"
import { buildTree, type TreeNode } from "./tree"
import { applyHostStatus } from "./tracker-handlers"
import type { SubagentNode, SubagentStatus } from "./types"
import type { Tracker } from "./tracker"

/** Longest rendered description before truncation with an ellipsis. */
const MAX_DESCRIPTION = 60

/** Map a subagent lifecycle status to its theme color. */
function statusColor(theme: TuiThemeCurrent, status: SubagentStatus) {
  if (status === "running") return theme.success
  if (status === "retry") return theme.warning
  if (status === "error") return theme.error
  return theme.textMuted
}

/** Clip a string to a readable width, appending an ellipsis when truncated. */
function truncate(value: string, max: number): string {
  if (value.length <= max) return value
  return `${value.slice(0, max - 1)}…`
}

export interface SidebarViewProps {
  api: TuiPluginApi
  nodes: Record<string, SubagentNode>
  sessionID: string
}

/** Sidebar tree rooted at the current session, live-updating with the tracker. */
export function SidebarView(props: SidebarViewProps) {
  const theme = props.api.theme.current
  const tree = buildTree(Object.values(props.nodes), props.sessionID)
  return (
    <box flexDirection="column">
      <Show when={tree.length > 0} fallback={<text fg={theme.textMuted}>no subagents</text>}>
        <For each={tree}>{(item) => <TreeRow api={props.api} theme={theme} node={item} depth={0} />}</For>
      </Show>
    </box>
  )
}

interface TreeRowProps {
  api: TuiPluginApi
  theme: TuiThemeCurrent
  node: TreeNode
  depth: number
}

/** One tree entry: status + agent, description below. Click opens the native session. */
function TreeRow(props: TreeRowProps) {
  const indent = props.depth * 2
  const open = (): void => {
    openSession(props.api, props.node.node.sessionID)
  }
  return (
    <box flexDirection="column">
      <box flexDirection="column" paddingLeft={indent} onMouseDown={open}>
        <box flexDirection="row" onMouseDown={open}>
          <text fg={statusColor(props.theme, props.node.node.status)}>{statusIcon(props.node.node.status)}</text>
          <text paddingLeft={1} onMouseDown={open}>{props.node.node.agent}</text>
          {props.node.node.todos === undefined ? null : (
            <text fg={props.theme.info}>{` (${props.node.node.todos.done}/${props.node.node.todos.total})`}</text>
          )}
        </box>
        {props.node.node.description === "" ? null : (
          <box paddingLeft={2} onMouseDown={open}>
            <text fg={props.theme.textMuted} onMouseDown={open}>
              {truncate(props.node.node.description, MAX_DESCRIPTION)}
            </text>
          </box>
        )}
      </box>
      <For each={props.node.children}>
        {(child) => <TreeRow api={props.api} theme={props.theme} node={child} depth={props.depth + 1} />}
      </For>
    </box>
  )
}

/** Factory producing a sidebar_content slot renderer for api.slots.register. */
export function createSidebar(api: TuiPluginApi, tracker: Tracker) {
  return (_ctx: TuiSlotContext, props: { session_id: string }) => {
    // The slot renderer is a plain function invoked from the host memo.
    // Touch host-reactive session state so create/status remounts the slot
    // even when the plugin and host do not share a solid-js instance.
    tracker.observe(props.session_id)
    api.state.session.count()
    const nodes: Record<string, SubagentNode> = {}
    for (const node of Object.values(tracker.nodes)) {
      const next = applyHostStatus(node, api.state.session.status(node.sessionID))
      nodes[next.sessionID] = next
    }
    return <SidebarView api={api} nodes={nodes} sessionID={props.session_id} />
  }
}
