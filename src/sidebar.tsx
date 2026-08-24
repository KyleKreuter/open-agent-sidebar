/** @jsxImportSource @opentui/solid */
/**
 * Sidebar UI for the open-agent-sidebar plugin.
 *
 * Renders the live subagent tree (built from tracker state via buildTree)
 * into the host-provided `sidebar_content` slot. Exposes a reusable
 * `SidebarView` component plus a `createSidebar` factory returning a slot
 * renderer suitable for `api.slots.register({ order, slots })`.
 */
import { createMemo, For, Show } from "solid-js"
import type { TuiPluginApi, TuiSlotContext, TuiThemeCurrent } from "@opencode-ai/plugin/tui"
import { statusIcon } from "./format"
import { buildTree, type TreeNode } from "./tree"
import type { SubagentNode, SubagentStatus } from "./types"
import type { Tracker } from "./tracker"

/** Longest rendered description before truncation with an ellipsis. */
const MAX_DESCRIPTION = 60
/** Longest rendered activity line before truncation with an ellipsis. */
const MAX_ACTIVITY = 30

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
  const tree = createMemo(() => buildTree(Object.values(props.nodes), props.sessionID))
  return (
    <box flexDirection="column">
      <Show when={tree().length > 0} fallback={<text fg={theme.textMuted}>no subagents</text>}>
        <For each={tree()}>{(item) => <TreeRow theme={theme} node={item} depth={0} />}</For>
      </Show>
    </box>
  )
}

interface TreeRowProps {
  theme: TuiThemeCurrent
  node: TreeNode
  depth: number
}

/** One tree row: status icon, agent, description, optional progress and activity. */
function TreeRow(props: TreeRowProps) {
  const node = props.node.node
  const todos = node.todos
  const activity = node.activity
  return (
    <box flexDirection="column">
      <box flexDirection="row" gap={1} paddingLeft={props.depth * 2}>
        <text fg={statusColor(props.theme, node.status)}>{statusIcon(node.status)}</text>
        <text>{node.agent}</text>
        <text fg={props.theme.textMuted}>{truncate(node.description, MAX_DESCRIPTION)}</text>
        {todos === undefined ? null : (
          <text fg={props.theme.info}>{`(${todos.done}/${todos.total})`}</text>
        )}
        {activity === undefined ? null : (
          <text fg={props.theme.textMuted}>{`[${truncate(activity, MAX_ACTIVITY)}]`}</text>
        )}
      </box>
      <For each={props.node.children}>
        {(child) => <TreeRow theme={props.theme} node={child} depth={props.depth + 1} />}
      </For>
    </box>
  )
}

/** Factory producing a sidebar_content slot renderer for api.slots.register. */
export function createSidebar(api: TuiPluginApi, tracker: Tracker) {
  return (_ctx: TuiSlotContext, props: { session_id: string }) => {
    // The slot renderer receives the currently viewed session on every
    // render; record it so the detail picker can isolate to this root.
    tracker.observe(props.session_id)
    return <SidebarView api={api} nodes={tracker.nodes} sessionID={props.session_id} />
  }
}