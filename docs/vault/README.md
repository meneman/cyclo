# Vault – Overview

This folder (`docs/vault`) is an **Obsidian vault** — the knowledge and notes
area for [cyclo](../../README.md), a top-down multiplayer prototype (PixiJS
client + Bun WebSocket server, authoritative server simulation with
client-side prediction).

## Opening in Obsidian

1. Open Obsidian
2. Choose **Open folder as vault**
3. Select this folder: `docs/vault`

> Settings live in `.obsidian/` and are versioned in the repo. The board in
> `Untitled Kanban.md` needs the `obsidian-kanban` community plugin (already
> configured).

## What goes here?

Start: [[What-is-cyclo]] — what the game is, why it exists, and what it is not.

- **Document gameplay and tech:** movement feel, netcode model, client
  prediction, interpolation, camera
- **Collect knowledge:** references, tuning notes, playtest observations,
  trade-offs
- **Record project knowledge:** everything that doesn't belong in code

Runtime state (player positions, connections) lives only in the running
server's memory — this vault is for notes, research, and overview around it.

## Structure

- [[What-is-cyclo]] – purpose, scope boundaries, typical play flow
- `Untitled Kanban.md` – task board (`todo` / `progress` / `waiting` / `done`;
  edited via the kanban agent skills, never hand-edited in source mode)

Suggested structure as it grows:

- `Decisions/` – recorded decisions with date and rationale
- `Playtests/` – one note per playtest session (setup, observations, fixes)
- `Inbox/` – quick intake for links and ideas, sorted regularly

## Conventions

- One note = one topic, filename = title
- Link notes with `[[Wikilinks]]` instead of writing everything into one file
- Use tags sparingly, e.g. `#decision`, `#playtest`, `#netcode`
- This `README.md` stays the vault's landing page
