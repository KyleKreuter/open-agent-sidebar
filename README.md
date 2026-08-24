# Open Agent Sidebar

Ein opencode-TUI-Plugin, das alle Subagenten der aktuellen Session live in der Sidebar anzeigt.
Subagenten sind Child-Sessions, die vom `task`-Tool erzeugt werden. Das Plugin verfolgt ihren
Lebenszyklus über den opencode-Event-Stream und rendert sie als verschachtelten Baum mit Status,
aktueller Aktivität und Todo-Fortschritt. Über `ctrl+shift+a` öffnet man einen Subagenten
in der nativen Session-Ansicht.

## Features

- **Live-Liste mit Status** – laufende Subagenten der Session mit Typ (Agent), Beschreibung und
  Status (`busy` / `retry` / `error`), farblich hervorgehoben. Fertige (`idle`) verschwinden.
- **Aktuelle Aktivität** – zeigt, welches Tool der Subagent gerade ausführt (laufendes Tool
  aus `message.part.updated`-Events).
- **Todo-Fortschritt** – Fortschrittsanzeige aus `todo.updated`-Events (done/total).
- **Native Session-Ansicht** – `ctrl+shift+a` öffnet den Subagenten in der Host-Session-Ansicht,
  inklusive der üblichen Zurück-Navigation.
- **Verschachtelte Subagenten** – Baumstruktur über `parentID`-Ketten, rekursiv dargestellt.

## Anforderungen

- **opencode >= 1.18** – das TUI-Plugin-System ist neu und versionabhängig. Es wird über
  `tui.json` konfiguriert (keine Directory-Auto-Discovery) und ist erst ab 1.18.x verfügbar.
  Die API kann sich zwischen Versionen ändern; dieses Plugin ist gegen 1.18.21 entwickelt.

## Installation

TUI-Plugins werden in `.opencode/tui.json` registriert. Es gibt zwei Wege:

**Lokal (Entwicklung)** – Eintrag mit relativem Pfad zum Plugin-Modul:

```json
{
  "$schema": "https://opencode.ai/tui.json",
  "plugin": [["../src/index.tsx", {}]]
}
```

Der relative Pfad wird gegen den Speicherort der `tui.json` (`.opencode/`) aufgelöst.
Alternativ kann auf das gebaute Bundle gezeigt werden: `["../dist/index.js", {}]`.

**Veröffentlichung (npm)** – später als npm-Spec, sobald das Paket publiziert ist:

```json
{
  "$schema": "https://opencode.ai/tui.json",
  "plugin": ["open-agent-sidebar@0.1.0"]
}
```

## Bedienung

- **Keybind:** `ctrl+shift+a` öffnet den Subagenten in der nativen Session-Ansicht.
- **Command Palette:** Befehl „Subagents: Open native session“.
- **Slash-Command:** `/agents` öffnet die native Session-Ansicht ebenfalls.

## Entwicklung

Voraussetzung: [Bun](https://bun.sh) ist installiert.

```bash
bun install        # Peer- und Dev-Abhängigkeiten installieren
bun run typecheck  # TypeScript-Check (tsc --noEmit)
bun run build      # erzeugt dist/index.js (ESM, externe Host-Imports)
```

**Externe Abhängigkeiten** – der Host (opencode) stellt diese zur Laufzeit bereit; sie werden
beim Build als extern markiert und nicht ins Bundle übernommen:

- `@opencode-ai/plugin` / `@opencode-ai/plugin/tui` – Plugin-API und Typen
- `@opentui/solid` / `@opentui/core` / `@opentui/keymap` – TUI-Rendering und Keymap
- `solid-js` – Reaktivität (exakt 1.9.12; eine doppelte Instanz bricht die Reaktivität)

## Architektur

```
Event-Stream (tracker) ──► Solid-Store ──► Sidebar-Slot + native Session-Ansicht
```

1. **Tracker** – abonniert die relevanten Events (`session.created`, `session.status`,
   `session.error`, `session.deleted`, `todo.updated`, `message.part.updated`) und hält einen
   reaktiven Solid-Store aktuell. Initial-Sync über `api.client`.
2. **Sidebar-Slot** – rendert den Subagenten-Baum in den `sidebar_content`-Slot (Order 450).
3. **Öffnen** – `client.tui.selectSession` wechselt in die native Session-Ansicht des Subagenten.

## Lizenz

MIT