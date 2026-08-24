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
  EventSessionStatus,
  EventSessionUpdated,
  EventTodoUpdated,
  Session,
  SessionStatus,
} from "@opencode-ai/sdk/v2"
import { parseTitle } from "./format"
import type { SubagentNode, SubagentStatus } from "./types"

/** Minimal store surface the handlers rely on. */
export interface TrackerStore {
  has(sessionID: string): boolean
  upsert(sessionID: string, node: SubagentNode): void
  patch(sessionID: string, patch: Partial<SubagentNode>): void
  removeSubtree(sessionID: string): void
}

/** Map a host SessionStatus to the plugin's lifecycle status. */
export function statusFromSessionStatus(status: SessionStatus | undefined): SubagentStatus {
  if (status === undefined) return "done"
  switch (status.type) {
    case "busy":
      return "running"
    case "retry":
      return "retry"
    case "idle":
      return "done"
    default:
      return "done"
  }
}

/** Build a SubagentNode from a host Session and its mapped status. */
export function nodeFromSession(session: Session, status: SubagentStatus): SubagentNode {
  const parsed = parseTitle(session.title)
  return {
    sessionID: session.id,
    parentID: session.parentID ?? "",
    agent: session.agent ?? parsed.agent,
    description: parsed.description,
    title: session.title,
    status,
    createdAt: session.time.created,
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

/** Refresh title/description/agent/cost of a tracked subagent. */
export function createSessionUpdatedHandler(store: TrackerStore) {
  return (event: EventSessionUpdated): void => {
    const info = event.properties.info
    if (!isSession(info) || !store.has(info.id)) return
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
    store.patch(
      sessionID,
      mapped === "done" ? { status: mapped, activity: undefined } : { status: mapped },
    )
  }
}

/** Mark a tracked subagent as errored. */
export function createSessionErrorHandler(store: TrackerStore) {
  return (event: EventSessionError): void => {
    const sessionID = event.properties.sessionID
    if (sessionID === undefined || !store.has(sessionID)) return
    store.patch(sessionID, { status: "error" })
  }
}

/** Remove a subagent and all of its descendants. */
export function createSessionDeletedHandler(store: TrackerStore) {
  return (event: EventSessionDeleted): void => {
    const sessionID = event.properties.sessionID
    if (!store.has(sessionID)) return
    store.removeSubtree(sessionID)
  }
}

/** Record todo progress for a tracked subagent. */
export function createTodoUpdatedHandler(store: TrackerStore) {
  return (event: EventTodoUpdated): void => {
    const { sessionID, todos } = event.properties
    if (!store.has(sessionID)) return
    const done = todos.filter((todo) => todo.status === "completed").length
    store.patch(sessionID, { todos: { done, total: todos.length } })
  }
}

/** Reflect the currently running tool as the node's activity. */
export function createMessagePartUpdatedHandler(store: TrackerStore) {
  return (event: EventMessagePartUpdated): void => {
    const { sessionID, part } = event.properties
    if (!store.has(sessionID) || part.type !== "tool") return
    if (part.state.status === "running") {
      store.patch(sessionID, { activity: part.state.title ?? part.tool })
      return
    }
    if (part.state.status === "completed" || part.state.status === "error") {
      store.patch(sessionID, { activity: undefined })
    }
  }
}