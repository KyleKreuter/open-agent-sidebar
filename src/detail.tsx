/** @jsxImportSource @opentui/solid */
/**
 * Detail route for open-agent-sidebar: the "agent-sidebar" view, the
 * "agent_sidebar.open" palette command, and a DialogSelect picker.
 */
import { createMemo, createSignal, For, onMount, Show } from "solid-js"
import { type Message, type Part, type Session, type TextPart } from "@opencode-ai/sdk/v2"
import { type TuiPluginApi, type TuiThemeCurrent } from "@opencode-ai/plugin/tui"
import { formatCost, formatTokens, statusIcon, type TokenCounts } from "./format"
import { type SubagentNode, type SubagentStatus } from "./types"

const ROUTE_NAME = "agent-sidebar"
const OPEN_COMMAND = "agent_sidebar.open"
const MAX_MESSAGES = 5
const MAX_TEXT = 200

function sessionIDFromParams(params: Record<string, unknown> | undefined): string {
  if (params === undefined) return ""
  const sessionID = params.sessionID
  return typeof sessionID === "string" ? sessionID : ""
}

function textPreview(parts: Part[]): string {
  const text = parts
    .filter((part): part is TextPart => part.type === "text")
    .map((part) => part.text)
    .join(" ")
  if (text.length <= MAX_TEXT) return text
  return `${text.slice(0, MAX_TEXT - 1)}…`
}

function sessionTokenCounts(session: Session | undefined): TokenCounts | undefined {
  if (session === undefined || session.tokens === undefined) return undefined
  const tokens = session.tokens
  return {
    input: tokens.input,
    output: tokens.output,
    reasoning: tokens.reasoning,
    cache: tokens.cache.read + tokens.cache.write,
  }
}

function statusColor(theme: TuiThemeCurrent, status: SubagentStatus | undefined) {
  if (status === "running") return theme.success
  if (status === "retry") return theme.warning
  if (status === "error") return theme.error
  return theme.textMuted
}
function openDetail(api: TuiPluginApi, tracker: { nodes: Record<string, SubagentNode> }): void {
  const nodes = Object.values(tracker.nodes)
  if (nodes.length === 0) {
    api.ui.toast({ message: "No subagents", variant: "info" })
    return
  }
  if (nodes.length === 1) {
    const soleNode = nodes[0]
    if (soleNode !== undefined) {
      api.route.navigate(ROUTE_NAME, { sessionID: soleNode.sessionID })
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
        api.route.navigate(ROUTE_NAME, { sessionID: option.value })
      },
    }),
  )
}

function DetailView(props: { api: TuiPluginApi; nodes: Record<string, SubagentNode>; sessionID: string }) {
  const theme = props.api.theme.current
  const session = createMemo(() => props.api.state.session.get(props.sessionID))
  const node = createMemo(() => props.nodes[props.sessionID])
  const [entries, setEntries] = createSignal<Array<{ info: Message; parts: Part[] }> | undefined>(undefined)
  const recent = createMemo(() => (entries() ?? []).slice(-MAX_MESSAGES).reverse())
  onMount(() => {
    if (props.sessionID === "") return
    void props.api.client.session
      .messages({ sessionID: props.sessionID })
      .then((result) => setEntries(result.error ? [] : (result.data ?? [])))
      .catch(() => setEntries([]))
  })
  return (
    <box flexDirection="column" gap={1} paddingLeft={1} paddingRight={1}>
      <Show when={props.sessionID !== ""} fallback={<text fg={theme.textMuted}>No subagent selected</text>}>
        <DetailHeader theme={theme} node={node()} session={session()} />
        <text fg={theme.textMuted}>recent messages</text>
        <Show when={entries() !== undefined} fallback={<text fg={theme.textMuted}>Loading messages…</text>}>
          <Show when={recent().length > 0} fallback={<text fg={theme.textMuted}>No messages</text>}>
            <For each={recent()}>{(entry) => <MessageRow theme={theme} entry={entry} />}</For>
          </Show>
        </Show>
      </Show>
    </box>
  )
}

function DetailHeader(props: { theme: TuiThemeCurrent; node: SubagentNode | undefined; session: Session | undefined }) {
  const status = props.node?.status
  const todos = props.node?.todos
  return (
    <box flexDirection="column" gap={1}>
      <box flexDirection="row" gap={1}>
        <text fg={statusColor(props.theme, status)}>{statusIcon(status ?? "done")}</text>
        <text>{props.node?.agent ?? "agent"}</text>
        <text fg={props.theme.textMuted}>{props.node?.description ?? "—"}</text>
        {todos === undefined ? null : (
          <text fg={props.theme.info}>{`(${todos.done}/${todos.total})`}</text>
        )}
      </box>
      <text fg={props.theme.textMuted}>{`cost ${formatCost(props.session?.cost)} · tokens ${formatTokens(sessionTokenCounts(props.session))}`}</text>
    </box>
  )
}

function MessageRow(props: { theme: TuiThemeCurrent; entry: { info: Message; parts: Part[] } }) {
  return (
    <box flexDirection="column" gap={0}>
      <text fg={props.entry.info.role === "user" ? props.theme.info : props.theme.textMuted}>
        {props.entry.info.role}
      </text>
      <text>{textPreview(props.entry.parts)}</text>
    </box>
  )
}

export function registerDetail(api: TuiPluginApi, tracker: { nodes: Record<string, SubagentNode> }): void {
  const offRoute = api.route.register([
    {
      name: ROUTE_NAME,
      render: ({ params }) => <DetailView api={api} nodes={tracker.nodes} sessionID={sessionIDFromParams(params)} />,
    },
  ])
  const offLayer = api.keymap.registerLayer({
    commands: [
      {
        name: OPEN_COMMAND,
        run: () => openDetail(api, tracker),
        title: "Subagents: Open detail view",
        category: "Plugin",
        namespace: "palette",
        slashName: "agents",
      },
    ],
    bindings: [{ key: "ctrl+shift+a", cmd: OPEN_COMMAND, desc: "Open subagent detail view" }],
  })
  api.lifecycle.onDispose(offRoute)
  api.lifecycle.onDispose(offLayer)
}