# import api

rest endpoints for pushing content into a solo/co-op session from an external
tool (a local rules assistant, a book extractor, whatever). everything lands
as ordinary data - imported oracle tables go into the key creator's personal
table library (they follow the user from game to game) and are also added to
the key's session so they're usable there immediately, imported monsters land
in the session's codex tab, and so on. all of it stays editable in the app.

## getting a key

open the session, make sure it's in solo/co-op mode, and mint a key from the
"Import keys" section in the right panel (owner only). the raw key
(`hxm_...`) is shown exactly once - only its sha-256 is stored. revoke it from
the same section.

keys are scoped hard: one key unlocks the `/import/*` endpoints for one
gm_less session and nothing else. if the session ever flips back to gm mode,
its keys stop working until it flips back.

## calling

```
POST {base}/api/import/...
authorization: Bearer hxm_...
content-type: application/json
```

the deployed api sits behind the same origin as the app; point `{base}` at
wherever your hexmapper lives. bodies up to 10 MB. requests are rate limited
per key owner (40/s sustained, 160 burst) - send one bundle per call, not one
row per call.

errors come back as `{"message": "bad request: ..."}` with a 4xx status.

## endpoints

### POST /api/import/oracle-tables

rollable tables. `key` is only needed when another row chains to the table;
it defaults to the table name.

no key handy? the same bundle json can be pasted straight into the app: the
import button next to "My Tables" in the oracle panel takes this exact format
(the `tables` array, with or without the wrapper object).

```json
{
  "replace": false,
  "tables": [
    {
      "name": "Reaction",
      "description": "2d6 on first contact",
      "mode": "weighted",
      "tag": "npc.reaction",
      "rows": [
        { "result": "Hostile", "weight": 1, "notes": "roll morale" },
        { "result": "Friendly - consult mood", "weight": 2, "chain": "Mood" }
      ]
    },
    { "name": "Mood", "rows": [ { "result": "Cheery" }, { "result": "Grim" } ] }
  ]
}
```

- `mode` is `weighted` (default) or `range`; range tables give every row a
  `"range": [min, max]` instead of weights
- `chain` points a row at another table in the same bundle by key - rolling
  the row also rolls the chained table
- name collisions with tables the key creator already owns are rejected unless
  `"replace": true`, which deletes the old copies first. replacing a table
  breaks chains that pointed at the old copy from tables outside the bundle,
  so re-import chained tables together
- limits: 100 tables, 1000 rows each, name 120 chars, result 500, notes 1000,
  tag 60

returns `{ "installed_tables": n, "installed_rows": n, "replaced_tables": n }`

### POST /api/import/stat-blocks

the bestiary. `kind` is `monster` (default) or `npc`. `data` is the stat
block the codex panel renders:

```json
{
  "stat_blocks": [
    {
      "kind": "monster",
      "data": {
        "name": "Goblin", "level": 1, "alignment": "C",
        "ac": 11, "maxHp": 7, "currentHp": 7,
        "move": "near", "attacks": "1 club +2 (1d4)",
        "stats": { "STR": 0, "DEX": 1, "CON": 0, "INT": -1, "WIS": 0, "CHA": -1 },
        "notes": "keen ears - surprised only on a 1"
      }
    }
  ]
}
```

appends (no dedupe - each block is one creature instance with its own hp
pool). up to 500 per bundle. returns `{ "imported": n }`

### POST /api/import/characters

full character sheets, owned by the key's creator. `data` is the same blob
the sheet uses - the useful fields:

```json
{
  "characters": [
    {
      "data": {
        "name": "Wilhelmina", "level": 1, "ancestry": "Human", "class": "Fighter",
        "alignment": "L", "background": "Soldier", "deity": "Saint Terragnis",
        "maxHitPoints": 6, "armorClass": 14, "XP": 0, "gearSlotsTotal": 12,
        "stats": { "STR": 14, "DEX": 12, "CON": 11, "INT": 9, "WIS": 10, "CHA": 8 },
        "attacks": [], "gear": [], "gold": 5, "silver": 0, "copper": 0
      }
    }
  ]
}
```

stats here are scores, not modifiers (the sheet derives mods). up to 50 per
bundle. returns `{ "imported": n }`

### POST /api/import/compendium

the reference library - gear catalogs and spell lists, browsable in the codex
tab. `kind` is `gear` or `spell`; `data` is freeform key/value, rendered as-is:

```json
{
  "entries": [
    { "kind": "gear",  "name": "Rope, 60'", "data": { "cost": "5 sp", "slots": 1 } },
    { "kind": "spell", "name": "Light", "data": { "tier": 1, "class": "priest, wizard", "duration": "1 hour real time", "range": "close" } }
  ]
}
```

upserts by (kind, name) - re-pushing the same entry refreshes its data
instead of duplicating it, so re-running an extraction is safe. up to 2000
per bundle. returns `{ "imported": n }`

## key management endpoints

these run under normal browser auth (the ui uses them), owner only:

- `POST /api/import-keys` `{ "session_id": ..., "name": "my-familiar" }` -
  returns the row plus `"key"` (the only time you see it)
- `GET /api/import-keys?session_id=...`
- `DELETE /api/import-keys/{id}`
