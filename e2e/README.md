# Playwright E2E

These tests exercise the browser UI with separate browser contexts for GM,
player 1, and player 2. They are intended to run against a staging deployment or
a local stack with real seeded email/password users.

## Setup

Install the browser once:

```bash
npm run test:e2e:install
```

Provide three seeded accounts:

```bash
export E2E_GM_EMAIL="e2e-gm@example.test"
export E2E_GM_PASSWORD="..."
export E2E_PLAYER1_EMAIL="e2e-player1@example.test"
export E2E_PLAYER1_PASSWORD="..."
export E2E_PLAYER2_EMAIL="e2e-player2@example.test"
export E2E_PLAYER2_PASSWORD="..."
```

`supabase/seed.sql` creates these local seed users with password
`HexmapE2E123`. For hosted staging, use staging-only passwords and store the
actual values in the `staging` GitHub Environment secrets.

Run against local Vite:

```bash
npm run test:e2e
```

Run against staging:

```bash
E2E_BASE_URL="https://staging.example.com" npm run test:e2e
```

If the account variables are missing, the multiplayer specs skip with a clear
message. This prevents accidental failures in development while still allowing
CI to run the real flow when secrets are configured.

## Current Coverage

- GM -> players: reveal one hex, hide one hex.
- GM -> players: reveal all, then hide an individual hex.
- Player -> GM and player -> player: blank-map terrain paint and marker sync.

## Next High-Value Specs

- Dice: player roll appears for GM and other players; GM annotation appears for players.
- Chat: player message appears in every tab and toast behavior does not duplicate messages.
- Party notebook: player adds a note/quest, GM edits/completes it, all players update.
- Vault: loot claim/split/store flows across GM and players.
- Dungeon: GM creates rooms/corridors/fog, players receive allowed view only.
- Characters: player creates/selects character, GM sees it, other players see active-character presence.
- Photos: GM broadcasts a reference photo, both players receive and can dismiss it.
- Responsive smoke: run core navigation on a mobile viewport.
