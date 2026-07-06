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

## Browser matrix

`chromium-multiplayer` (Desktop Chrome) runs on every invocation. Setting
`E2E_ALL_BROWSERS=1` adds the `firefox-multiplayer` (Desktop Firefox) and
`mobile-chromium` (Pixel 7) projects; the nightly cron in `test-e2e.yml` sets
this automatically, and `workflow_dispatch` exposes it as the `all_browsers`
input. Specs that need a wide viewport for the crowded topbar override the
device viewport explicitly but keep the rest of the mobile profile (touch,
user agent, scale factor).

The firefox project sets `media.volume_scale: 0` because Playwright mutes
Chromium by default but not Firefox — without it a local run plays every
dice and chat sound through the machine's speakers.

## Current Coverage

- GM -> players: reveal one hex, hide one hex.
- GM -> players: reveal all, then hide an individual hex.
- Player -> GM and player -> player: blank-map terrain paint and marker sync.
- GM -> players: oracle yes/no rolls sync to both players.
- Player -> GM and player -> player: custom oracle table rolls sync to everyone.
- Dice: player and GM rolls appear exactly once in every tab (echo suppression).
- Chat: messages reach every tab exactly once, in both directions.
- Map follow: GM switches to a child map and back; all players follow.
- Map lifecycle: GM creates, renames, and deletes a child map; every client
  converges on the same active map (guards the duplicate-World-Map incident).
- Dungeon editing: room/corridor creation propagates GM -> players,
  player -> GM, and player -> player; fog mode toggle and fog reveals reach
  every client.
- Character sheet: JSON import, HP / temp HP / renown adjustments, and gear
  additions show up on the GM's view of the character.
- Vault: coin deposit updates the party bank on all clients; split pays every
  active character; assign delivers gear to the chosen player; claim moves an
  item into the claimant's inventory.
- Party notebook: quests and notes sync between players and GM, including
  completion.
- Calendar: GM advances the day; every player sees the new date.
- Photos: GM uploads and broadcasts a reference photo; players view and
  dismiss it independently.
- Reconnect: a player who drops offline sees the disconnect banner, misses a GM
  reveal, then converges after reconnect with no hex-grid teardown/remount.
- Cross-session isolation: a client in one session receives no dice rolls,
  chat messages, or sounds (instrumented WebAudio probe) from another session
  its account is a member of.

## Next High-Value Specs

- Dice: GM annotation on a roll appears for players.
- Dungeon: players receive the allowed fog view only (visibility, not just counts).
- Characters: other players see active-character presence.
- Vault: group storage containers (store/withdraw) across clients.
