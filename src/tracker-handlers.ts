/**
 * Pure event-handler factories for the subagent tracker.
 *
 * Each factory takes a `TrackerStore` (an abstraction over the Solid store
 * setter) and returns a lightweight handler for one event type. Handlers are
 * defensive: they read `event.properties`, guard loose payload shapes, and
 * never perform heavy work.
 */

import type {
  EventMessagePartUpdated,
  EventSessionCreated,
  EventSessionDeleted,
  EventSessionError,
  EventSessionIdle,
  EventSessionStatus,
  EventSessionUpdated,
  EventTodoUpdated,
  Session,
  SessionStatus,
  ToolPart,
} from "@opencode-ai/sdk/v2"
import { parseTitle } from "./format"
import type { SubagentNode, SubagentStatus } from "./types"

/** Minimal store surface the handlers rely on. */
export interface TrackerStore {
  has(sessionID: string): boolean
  get(sessionID: string): SubagentNode | undefined
  upsert(sessionID: string, node: SubagentNode): void
  patch(sessionID: string, patch: Partial<SubagentNode>): void
  removeSubtree(sessionID: string): void
}

/** Map a host SessionStatus to the plugin's lifecycle status. */
export function statusFromSessionStatus(status: SessionStatus | undefined): SubagentStatus | undefined {
  if (status === undefined) return undefined
  switch (status.type) {
    case "busy":
      return "running"
    case "retry":
      return "retry"
    case "idle":
      return "done"
    default:
      return undefined
  }
}

/** Overlay the host session status onto a tracker node when the host reports one. */
export function applyHostStatus(node: SubagentNode, host: SessionStatus | undefined): SubagentNode {
  const mapped = statusFromSessionStatus(host)
  if (mapped === undefined) return node
  return { ...node, status: mapped }
}

/** Build a SubagentNode from a host Session and its mapped status. */
export function nodeFromSession(session: Session, status: SubagentStatus): SubagentNode {
  const parsed = parseTitle(session.title)
  const created = session.time?.created
  return {
    sessionID: session.id,
    parentID: session.parentID ?? "",
    agent: session.agent ?? parsed.agent,
    description: parsed.description,
    title: session.title,
    status,
    createdAt: Number.isFinite(created) ? created : Date.now(),
    cost: session.cost,
  }
}

/** True when the payload is a Session-shaped object. */
function isSession(value: unknown): value is Session {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { id?: unknown }).id === "string" &&
    typeof (value as { title?: unknown }).title === "string"
  )
}

/** Track a newly spawned subagent (only when it has a parent). */
export function createSessionCreatedHandler(store: TrackerStore) {
  return (event: EventSessionCreated): void => {
    const info = event.properties.info
    if (!isSession(info) || !info.parentID) return
    store.upsert(info.id, nodeFromSession(info, "running"))
  }
}

/** Insert a missed child session, or refresh title/description/agent/cost. */
export function createSessionUpdatedHandler(store: TrackerStore) {
  return (event: EventSessionUpdated): void => {
    const info = event.properties.info
    if (!isSession(info)) return
    if (!store.has(info.id)) {
      if (!info.parentID) return
      store.upsert(info.id, nodeFromSession(info, "running"))
      return
    }
    const parsed = parseTitle(info.title)
    store.patch(info.id, {
      title: info.title,
      agent: info.agent ?? parsed.agent,
      description: parsed.description,
      cost: info.cost,
    })
  }
}

/** Map host status changes onto the node; clear activity when idle. */
export function createSessionStatusHandler(store: TrackerStore) {
  return (event: EventSessionStatus): void => {
    const { sessionID, status } = event.properties
    if (!store.has(sessionID)) return
    const mapped = statusFromSessionStatus(status)
    if (mapped === undefined) return
    store.patch(
      sessionID,
      mapped === "done"
        ? { status: mapped, activity: undefined, activityCallID: undefined }
        : { status: mapped },
    )
  }
}

/** Mark a tracked subagent done when the host reports the session idle. */
export function createSessionIdleHandler(store: TrackerStore) {
  return (event: EventSessionIdle): void => {
    const sessionID = event.properties.sessionID
    if (sessionID === undefined || !store.has(sessionID)) return
    store.patch(sessionID, { status: "done", activity: undefined, activityCallID: undefined })
  }
}

/** Mark a tracked subagent as errored and clear its current activity. */
export function createSessionErrorHandler(store: TrackerStore) {
  return (event: EventSessionError): void => {
    const sessionID = event.properties.sessionID
    if (sessionID === undefined || !store.has(sessionID)) return
    store.patch(sessionID, { status: "error", activity: undefined, activityCallID: undefined })
  }
}

/** Remove a subagent and all of its descendants; record the deletion. */
export function createSessionDeletedHandler(store: TrackerStore, onDeleted: (sessionID: string) => void) {
  return (event: EventSessionDeleted): void => {
    const sessionID = event.properties.sessionID
    if (sessionID === undefined) return
    onDeleted(sessionID)
    if (!store.has(sessionID)) return
    store.removeSubtree(sessionID)
  }
}

/** Record todo progress for a tracked subagent. */
export function createTodoUpdatedHandler(store: TrackerStore) {
  return (event: EventTodoUpdated): void => {
    const { sessionID, todos } = event.properties
    if (!store.has(sessionID) || !Array.isArray(todos)) return
    const done = todos.filter((todo) => todo.status === "completed").length
    store.patch(sessionID, { todos: { done, total: todos.length } })
  }
}

/** True when the value is an object with a string `status` field. */
function hasStringStatus(value: unknown): value is { status: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { status?: unknown }).status === "string"
  )
}

/** True when the value is a ToolPart-shaped object. */
function isToolPart(value: unknown): value is ToolPart {
  if (typeof value !== "object" || value === null) return false
  const part = value as { type?: unknown; tool?: unknown; callID?: unknown; state?: unknown }
  if (part.type !== "tool") return false
  if (typeof part.tool !== "string") return false
  if (typeof part.callID !== "string") return false
  return hasStringStatus(part.state)
}

/** Reflect the currently running tool as the node's activity. */
export function createMessagePartUpdatedHandler(store: TrackerStore) {
  return (event: EventMessagePartUpdated): void => {
    const properties = event.properties
    if (typeof properties !== "object" || properties === null) return
    const { sessionID, part } = properties
    if (!store.has(sessionID) || !isToolPart(part)) return
    if (part.state.status === "running") {
      store.patch(sessionID, { activity: part.state.title ?? part.tool, activityCallID: part.callID })
      return
    }
    if (part.state.status === "completed" || part.state.status === "error") {
      const node = store.get(sessionID)
      if (node?.activityCallID !== part.callID) return
      store.patch(sessionID, { activity: undefined, activityCallID: undefined })
    }
  }
}