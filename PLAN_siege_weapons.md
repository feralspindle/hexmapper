# Siege Weapons and Exploding Dice - Implementation Plan

## Current State

- **Dice engine** (`server/vendor/ttrpg-dice-engine`) already supports exploding dice end to end: notation `!` (explode on max), `!>=N` (threshold), `!!` (compounding), per-die `exploded_from` provenance, capped at 20 extra rolls per die, and exact probability math for exploding notation. zero engine work needed.
- **Dice domain** (`server/src/domains/dice/`) doesn't use any of it. `POST /dice-rolls` accepts a flat pending map (`{"d20": 1, "d6": 2}`) plus an int modifier, rolls with a hand-rolled `rand` loop instead of the engine, and stores `results` as `[{die, value}]` which can't represent exploded or dropped dice. the engine is only used for stats, and the notation it builds never contains `!`.
- **Frontend roller** (`DungeonDiceSection.vue` + `diceStore.js`) has no notation input, just die-count buttons. rolling is 100% server-side; history and toasts render per-die breakdowns as `[17, 4]`.
- **Shared panel pattern**: `PartyNotebook.vue` is the floating panel with tabs (Quests / Notes / Vault / Calendar). `vaultStore.js` + `server/src/domains/vault/` is the canonical shape for a realtime shared store + event-sourced server domain.

## Design Decisions

1. **the engine does all rolling.** replace the hand-rolled `rand` loop in `dice/handlers.rs` with `ttrpg_dice_engine::roll()`. one source of truth, per-die breakdown, exploding support, and stats all come along for free.
2. **notation alongside pending, not instead of it.** `POST /dice-rolls` gains an optional `notation` field (`"3d6!+1"`). the pending map keeps working so old macros, character sheet rolls, and any stale clients are unaffected.
3. **results jsonb gains optional fields, not a new shape.** `[{die, value, dropped?, exploded_from?}]`. old rows just lack the new fields and render as they always did.
4. **stats need no new work.** the engine computes the exact distribution for exploding notation (`exploding_pmf`), so percentile / z-score / luck leaderboards work on exploding rolls automatically.
5. **siege weapons are event-sourced like the vault.** one `siege_weapons` table, one projection, domain folder at `server/src/domains/siege/` mirroring the vault domain.
6. **fire rolls server-side, in the same transaction as the ammo decrement.** if the client rolled separately, a failed roll call would leave ammo decremented with no roll. fire emits both rolls (attack `1d20+bonus`, damage notation) through the same event path the dice domain uses, so history, toasts, sounds, and stats all just work.
7. **crew is keyed by character id**, matching the active-character model. reload requires `crewed_by.length >= crew_required`.

## To-Do List

### Phase 1: exploding notation through the dice pipeline (server)

- [x] 1.1 Add optional `notation: Option<String>` to the roll payload; validate with `ttrpg_dice_engine::parse()` and walk the AST to enforce existing limits (allowed die sizes, max 20 per group, max 40 total dice)
- [x] 1.2 Replace the `roll()` loop in `dice/handlers.rs:178-218` with `ttrpg_dice_engine::roll()` (both paths, pending and notation)
- [x] 1.3 Extend `results` serialization with `dropped` and `exploded_from` from `DieResult`
- [x] 1.4 Stats: when notation is provided, pass it verbatim to `distribution()` instead of rebuilding from pending
- [x] 1.5 Migration: nullable `notation` column on `dice_rolls` so history renders the exact expression (exploding marker included)

### Phase 2: exploding in the regular roller

- [x] 2.1 `diceStore.rollDice` gains a notation path; POST includes `notation` when set
- [x] 2.2 Exploding toggle in `DungeonDiceSection.vue`; when on, the built notation appends `!` to each die group, and the `formula` preview shows it
- [x] 2.3 Render exploded dice in history rows and `DiceRollToast.vue` (highlight class on dice with `exploded_from`, show chains like `3 -> 3 -> 5`)
- [x] 2.4 Compat: renderer handles rows without the new fields; keep crit/fumble detection working for d20s inside notation

### Phase 3: siege weapons backend

- [x] 3.1 Migration: `siege_weapons` table (id, session_id, name, damage_notation, attack_bonus, ammo / max_ammo nullable, hp / max_hp, crew_required, crewed_by uuid[], is_loaded, notes, sort_order, created_by, timestamps) + RLS (member select) + realtime publication
- [x] 3.2 Domain folder `server/src/domains/siege/` (handlers, routes, projection), registered in `domains/mod.rs`, events: created / updated / deleted / fired / reloaded / crew_changed / damaged / repaired
- [x] 3.3 Endpoints: `GET/POST /siege-weapons`, `PATCH/DELETE /siege-weapons/{id}`, `POST /siege-weapons/{id}/fire`, `/reload`, `/crew`, `/damage`
- [x] 3.4 Fire: require loaded + ammo (if tracked), emit attack and damage rolls into `dice_rolls` (labels `"{name} attack"` / `"{name} damage"`), decrement ammo, set `is_loaded = false`, all in one transaction
- [x] 3.5 Reload: require crew count >= crew_required
- [x] 3.6 Validate `damage_notation` with engine parse on create/update
- [x] 3.7 Authz: any session member can create, edit, fire, reload, damage, and crew weapons (matches the vault's shared-resource model)

### Phase 4: siege weapons panel (frontend)

- [x] 4.1 `src/stores/siegeStore.js`, vault-shaped: `init`/`cleanup`, realtime channel on `siege_weapons` filtered by session_id, mutations via apiClient with `source_client` echo guards
- [x] 4.2 New "Siege" tab in `PartyNotebook.vue` hosting `SiegeWeaponsPanel.vue`
- [x] 4.3 Weapon cards: name, damage notation, attack bonus, ammo pips, hp bar, crew slots, loaded state
- [x] 4.4 Fire button (enabled when loaded + ammo), reload button (enabled when crewed), crew join/leave, damage/repair controls
- [x] 4.5 GM edit mode: create/edit weapons with notation input, validated on save
- [x] 4.6 Rolls land in `dice_rolls` realtime so existing history, toast, sound, and leaderboard pick them up with no extra wiring

### Phase 5: polish and tests

- [x] 5.1 Explosion sound variant in `diceSound.js` when any die exploded
- [x] 5.2 Rust unit tests: notation validation, limit enforcement, exploding results serialization, fire transaction (ammo decrement + rolls atomic)
- [x] 5.3 e2e: exploding toggle roll shows highlight in history; siege fire flow (fire, reload, crew) across two clients
- [x] 5.4 Pin-to-journal works on siege rolls (should be free, verify)

## Implementation Order

1. Phase 1 (server notation) -> 2. Phase 2 (roller UI) -> 3. Phase 3 (siege backend) -> 4. Phase 4 (siege panel) -> 5. Phase 5 (polish, tests)

phases 1-2 are independently shippable and unblock the siege work. phase 3 can start once 1.4 lands (fire reuses the notation roll path).

## Notes

- Engine caps explosions at 20 extra rolls per die (`EXPLODE_CAP`), so a runaway `!!` chain terminates.
- Old `pending`-based rows never get the new fields; don't backfill.
- If free notation input turns out too loose later (players typing `1000d1000`), the AST walk in 1.1 is where to tighten. engine hard caps are 1000 dice / 1000 sides, stricter than our domain limits.
- Whether fire should also auto-roll attack (decision 6) could be cut to damage-only if the table finds two rolls noisy. it's a one-line change in the handler.
- A weapon with `ammo = null` never runs out (siege engine on a wall, ship-mounted ballista, etc).
