/**
 * Event-driven tracker for subagent nodes.
 *
 * Maintains a reactive Solid store keyed by sessionID. Initial state is
 * synced from the host via api.client, then kept live through event
 * subscriptions. All subscriptions are cleaned up on dispose.
 */

import type { TuiPluginApi } from "@opencode-ai/plugin/tui"
import { createStore, type SetStoreFunction } from "solid-js/store"
import type { SubagentNode } from "./types"
import {
  createMessagePartUpdatedHandler,
  createSessionCreatedHandler,
  createSessionDeletedHandler,
  createSessionErrorHandler,
  createSessionStatusHandler,
  createSessionUpdatedHandler,
  createTodoUpdatedHandler,
  nodeFromSession,
  statusFromSessionStatus,
  type TrackerStore,
} from "./tracker-handlers"

/** Build a TrackerStore backed by the reactive Solid store. */
function createStoreAdapter(
  nodes: Record<string, SubagentNode>,
  setNodes: SetStoreFunction<Record<string, SubagentNode>>,
): TrackerStore {
  return {
    has: (sessionID) => sessionID in nodes,
    get: (sessionID) => nodes[sessionID],
    upsert: (sessionID, node) => setNodes(sessionID, node),
    patch: (sessionID, patch) => setNodes(sessionID, patch),
    removeSubtree: (sessionID) => {
      setNodes((prev) => {
        const next = { ...prev }
        const doomed = new Set<string>([sessionID])
        let grew = true
        while (grew) {
          grew = false
          for (const [id, node] of Object.entries(next)) {
            if (doomed.has(node.parentID) && !doomed.has(id)) {
              doomed.add(id)
              grew = true
            }
          }
        }
        for (const id of doomed) delete next[id]
        return next
      })
    },
  }
}

/** Load existing child sessions and their statuses into the store. */
async function syncInitial(api: TuiPluginApi, store: TrackerStore, deletedIDs: Set<string>): Promise<void> {
  const listResult = await api.client.session.list({ roots: false })
  if (listResult.error || listResult.data === undefined) {
    deletedIDs.clear()
    return
  }
  const statusResult = await api.client.session.status()
  const statuses = statusResult.data ?? {}

  for (const session of listResult.data) {
    if (session.parentID === undefined) continue
    // A session deleted during the async sync must not be re-inserted by
    // this snapshot. Subscriptions are installed before sync, so entries
    // already received via live events are fresher than this snapshot.
    if (deletedIDs.has(session.id)) continue
    if (store.has(session.id)) continue
    store.upsert(session.id, nodeFromSession(session, statusFromSessionStatus(statuses[session.id]) ?? "done"))
  }
  deletedIDs.clear()
}

/** Public surface of the tracker consumed by the sidebar and detail route. */
export interface Tracker {
  /** Reactive store of subagent nodes keyed by sessionID. */
  nodes: Record<string, SubagentNode>
  /** Record the currently viewed root session (called on every sidebar render). */
  observe(sessionID: string): void
  /** The last observed root session ID, if any. */
  currentRoot(): string | undefined
}

/** Create the tracker: reactive store, event subscriptions, initial sync. */
export function createTracker(api: TuiPluginApi): Tracker {
  const [nodes, setNodes] = createStore<Record<string, SubagentNode>>({})
  const store = createStoreAdapter(nodes, setNodes)

  const deletedIDs = new Set<string>()
  let observedRoot: string | undefined

  const unsubscribes = [
    api.event.on("session.created", createSessionCreatedHandler(store)),
    api.event.on("session.updated", createSessionUpdatedHandler(store)),
    api.event.on("session.status", createSessionStatusHandler(store)),
    api.event.on("session.error", createSessionErrorHandler(store)),
    api.event.on("session.deleted", createSessionDeletedHandler(store, (sessionID) => deletedIDs.add(sessionID))),
    api.event.on("todo.updated", createTodoUpdatedHandler(store)),
    api.event.on("message.part.updated", createMessagePartUpdatedHandler(store)),
  ]
  for (const unsubscribe of unsubscribes) {
    api.lifecycle.onDispose(unsubscribe)
  }

  void syncInitial(api, store, deletedIDs).catch(() => {})

  return {
    nodes,
    observe: (sessionID) => {
      observedRoot = sessionID
    },
    currentRoot: () => observedRoot,
  }
}