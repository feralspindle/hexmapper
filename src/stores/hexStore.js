import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { supabase } from "@/lib/supabase";
import router from "@/router/index.js";
import { useMapStore } from "@/stores/mapStore.js";
import { useSessionStore } from "@/stores/sessionStore.js";

export const MARKER_KINDS = [
  { id: "town", label: "Town" },
  { id: "city", label: "City" },
  { id: "dungeon", label: "Dungeon" },
  { id: "landmark", label: "Landmark" },
];

export function parseMarkers(raw) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item) =>
      typeof item === "string"
        ? { id: crypto.randomUUID(), kind: item, label: "" }
        : item,
    );
  } catch {
    return raw ? [{ id: crypto.randomUUID(), kind: raw, label: "" }] : [];
  }
}

export function serializeMarkers(markers) {
  return markers.length ? JSON.stringify(markers) : null;
}

export const TERRAIN_TYPES = [
  { id: "plains", label: "Plains", color: "#c8d98a" },
  { id: "forest", label: "Forest", color: "#4a7c59" },
  { id: "mountain", label: "Mountain", color: "#8a7568" },
  { id: "water", label: "Water", color: "#4a90b8" },
  { id: "desert", label: "Desert", color: "#d4b483" },
  { id: "swamp", label: "Swamp", color: "#5e7a5e" },
  { id: "city", label: "City", color: "#c0a060" },
  { id: "dungeon", label: "Dungeon", color: "#6b5b73" },
  { id: "snow", label: "Snow", color: "#e8eef2" },
  { id: "volcanic", label: "Volcanic", color: "#8b2222" },
];

function cellKey(q, r) {
  return `${q}:${r}`;
}

export const useHexStore = defineStore("hex", () => {
  const CLIENT_ID = crypto.randomUUID();
  const hexCells = ref(new Map());
  const selectedHex = ref(null);
  const partyHex = ref(null);
  const hexDungeons = ref([]);
  const dungeonsLoading = ref(false);
  const loading = ref(false);
  const currentSessionId = ref(null);
  const currentMapId = ref(null);
  let channel = null;
  let partyChannel = null;

  const selectedCell = computed(() => {
    if (!selectedHex.value) return null;
    return (
      hexCells.value.get(cellKey(selectedHex.value.q, selectedHex.value.r)) ??
      null
    );
  });

  async function init(sessionId, mapId) {
    loading.value = true;
    currentSessionId.value = sessionId;
    currentMapId.value = mapId;
    hexCells.value = new Map();
    selectedHex.value = null;

    const { data, error } = await supabase
      .from("hex_cells")
      .select("*")
      .eq("map_id", mapId);

    if (!error && data) {
      const map = new Map();
      for (const row of data) map.set(cellKey(row.q, row.r), row);
      hexCells.value = map;
    }
    loading.value = false;

    // Load party hex from database (fallback for players who join after broadcast)
    await _loadPartyHexFromDb();

    if (channel) supabase.removeChannel(channel);
    channel = supabase
      .channel(`map:${mapId}:hex`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "hex_cells",
          filter: `map_id=eq.${mapId}`,
        },
        handleRealtimeEvent,
      )
      .subscribe();

    if (partyChannel) supabase.removeChannel(partyChannel);
    partyChannel = supabase
      .channel(`map:${mapId}:party`)
      .on("broadcast", { event: "party" }, ({ payload }) => {
        const next = payload.q != null ? { q: payload.q, r: payload.r } : null;
        const prev = partyHex.value;
        if (prev?.q === next?.q && prev?.r === next?.r) return;
        partyHex.value = next;
        _savePartyHex();
      })
      .subscribe();

    // Also listen for database updates to the sessions table
    await _setupSessionChannel(sessionId);
  }

  async function _loadPartyHexFromDb() {
    const { data, error } = await supabase
      .from("sessions")
      .select("party_hex_q, party_hex_r")
      .eq("id", currentSessionId.value)
      .single();

    if (error) {
      console.error("_loadPartyHexFromDb error:", error.message);
      // Fall back to localStorage
      _loadPartyHex();
      return;
    }

    if (data && (data.party_hex_q !== null || data.party_hex_r !== null)) {
      partyHex.value = { q: data.party_hex_q, r: data.party_hex_r };
    } else {
      // Fall back to localStorage
      _loadPartyHex();
    }
  }

  let sessionChannel = null;

  async function _setupSessionChannel(sessionId) {
    if (sessionChannel) supabase.removeChannel(sessionChannel);
    sessionChannel = supabase
      .channel(`session:${sessionId}:party`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "sessions",
          filter: `id=eq.${sessionId}`,
        },
        ({ new: row }) => {
          if (row.party_hex_q !== undefined || row.party_hex_r !== undefined) {
            const next =
              row.party_hex_q != null
                ? { q: row.party_hex_q, r: row.party_hex_r }
                : null;
            const prev = partyHex.value;
            if (prev?.q === next?.q && prev?.r === next?.r) return;
            partyHex.value = next;
            _savePartyHex();
          }
        },
      )
      .subscribe();
  }

  function _partyKey() {
    return `party_hex_${currentSessionId.value}_${currentMapId.value}`;
  }
  function _loadPartyHex() {
    try {
      const saved = localStorage.getItem(_partyKey());
      partyHex.value = saved ? JSON.parse(saved) : null;
    } catch {
      partyHex.value = null;
    }
  }
  function _savePartyHex() {
    if (partyHex.value)
      localStorage.setItem(_partyKey(), JSON.stringify(partyHex.value));
    else localStorage.removeItem(_partyKey());
  }

  async function setPartyHex(q, r) {
    partyHex.value = { q, r };
    _savePartyHex();
    // Persist to database for players who join after broadcast
    const { error } = await supabase
      .from("sessions")
      .update({ party_hex_q: q, party_hex_r: r })
      .eq("id", currentSessionId.value);
    if (error) console.error("setPartyHex db update error:", error.message);
    // Broadcast for real-time sync with existing players
    partyChannel?.send({
      type: "broadcast",
      event: "party",
      payload: { q, r },
    });
  }

  async function clearPartyHex() {
    partyHex.value = null;
    _savePartyHex();
    // Clear in database as well
    const { error } = await supabase
      .from("sessions")
      .update({ party_hex_q: null, party_hex_r: null })
      .eq("id", currentSessionId.value);
    if (error) console.error("clearPartyHex db update error:", error.message);
    // Broadcast for real-time sync with existing players
    partyChannel?.send({
      type: "broadcast",
      event: "party",
      payload: { q: null, r: null },
    });
  }

  function handleRealtimeEvent({ eventType, new: row, old }) {
    if (eventType === "INSERT" || eventType === "UPDATE") {
      if (row.source_client === CLIENT_ID) return;
      if (!useSessionStore().isGM && row.revealed === false) {
        hexCells.value.delete(cellKey(row.q, row.r));
        return;
      }
      hexCells.value.set(cellKey(row.q, row.r), row);
    } else if (eventType === "DELETE") {
      hexCells.value.delete(cellKey(old.q, old.r));
    }
  }

  function selectHex(q, r) {
    if (selectedHex.value?.q === q && selectedHex.value?.r === r) {
      selectedHex.value = null;
    } else {
      selectedHex.value = { q, r };
    }
  }

  function deselectHex() {
    selectedHex.value = null;
  }

  async function upsertHex(q, r, patch) {
    if (!currentMapId.value) {
      console.warn("upsertHex called with no currentMapId — skipping");
      return;
    }
    const key = cellKey(q, r);
    const existing = hexCells.value.get(key);
    const merged = {
      label: "",
      notes: "",
      terrain_type: null,
      color: null,
      has_dungeon: false,
      revealed: false,
      ...existing,
      ...patch,
      session_id: currentSessionId.value,
      map_id: currentMapId.value,
      q,
      r,
      source_client: CLIENT_ID,
    };
    hexCells.value.set(key, merged);

    const { data, error } = await supabase
      .from("hex_cells")
      .upsert(merged, { onConflict: "map_id,q,r" })
      .select()
      .single();

    if (error) {
      if (existing) hexCells.value.set(key, existing);
      else hexCells.value.delete(key);
      console.error("upsertHex error:", error.message);
    } else if (data) {
      hexCells.value.set(key, data);
    }
  }

  async function addMarker(q, r, kind) {
    const current = parseMarkers(
      hexCells.value.get(cellKey(q, r))?.marker_color,
    );
    const next = [...current, { id: crypto.randomUUID(), kind, label: "" }];
    await upsertHex(q, r, { marker_color: serializeMarkers(next) });
  }

  async function removeMarker(q, r, markerId) {
    const current = parseMarkers(
      hexCells.value.get(cellKey(q, r))?.marker_color,
    );
    const next = current.filter((m) => m.id !== markerId);
    await upsertHex(q, r, { marker_color: serializeMarkers(next) });
  }

  async function updateMarkerLabel(q, r, markerId, label) {
    const current = parseMarkers(
      hexCells.value.get(cellKey(q, r))?.marker_color,
    );
    const next = current.map((m) => (m.id === markerId ? { ...m, label } : m));
    await upsertHex(q, r, { marker_color: serializeMarkers(next) });
  }

  async function deleteHex(q, r) {
    const key = cellKey(q, r);
    const backup = hexCells.value.get(key);
    hexCells.value.delete(key);
    selectedHex.value = null;

    const { error } = await supabase
      .from("hex_cells")
      .delete()
      .eq("map_id", currentMapId.value)
      .eq("q", q)
      .eq("r", r);

    if (error) {
      if (backup) hexCells.value.set(key, backup);
      console.error("deleteHex error:", error.message);
    }
  }

  async function fetchDungeonsForHex(hexId) {
    if (!hexId) {
      hexDungeons.value = [];
      return;
    }
    dungeonsLoading.value = true;
    const { data, error } = await supabase
      .from("dungeons")
      .select("id, name, created_at")
      .eq("hex_id", hexId)
      .order("created_at", { ascending: true });
    dungeonsLoading.value = false;
    if (!error) hexDungeons.value = data ?? [];
  }

  async function createDungeon(q, r, name = "Unnamed Dungeon") {
    if (!currentMapId.value) {
      console.warn("createDungeon called with no currentMapId — skipping");
      return;
    }
    const key = cellKey(q, r);
    const cell = hexCells.value.get(key);

    let hexId = cell?.id;
    if (!hexId) {
      const { data, error } = await supabase
        .from("hex_cells")
        .upsert(
          {
            session_id: currentSessionId.value,
            q,
            r,
            has_dungeon: true,
            source_client: CLIENT_ID,
            map_id: currentMapId.value,
          },
          { onConflict: "map_id,q,r" },
        )
        .select()
        .single();
      if (error) {
        console.error("createDungeon upsert hex error:", error.message);
        return;
      }
      hexId = data.id;
      hexCells.value.set(key, data);
    } else if (!cell.has_dungeon) {
      await upsertHex(q, r, { has_dungeon: true });
    }

    const { data, error } = await supabase
      .from("dungeons")
      .insert({ session_id: currentSessionId.value, hex_id: hexId, name })
      .select()
      .single();
    if (error) {
      console.error("createDungeon insert error:", error.message);
      return;
    }

    hexDungeons.value = [...hexDungeons.value, data];
    router.push({
      name: "dungeon",
      params: { sessionId: currentSessionId.value, dungeonId: data.id },
    });
  }

  async function ensureCellExists(q, r) {
    const key = cellKey(q, r);
    const existing = hexCells.value.get(key);
    if (existing?.id) return existing.id;

    const { data, error } = await supabase
      .from("hex_cells")
      .upsert(
        {
          session_id: currentSessionId.value,
          map_id: currentMapId.value,
          q,
          r,
          source_client: CLIENT_ID,
        },
        { onConflict: "map_id,q,r" },
      )
      .select()
      .single();

    if (error || !data) {
      console.error("ensureCellExists error:", error?.message);
      return null;
    }
    hexCells.value.set(key, data);
    return data.id;
  }

  async function toggleRevealed(q, r) {
    const current = hexCells.value.get(cellKey(q, r))?.revealed ?? false;
    await upsertHex(q, r, { revealed: !current });
  }

  async function revealAll() {
    const updates = [];
    for (const cell of hexCells.value.values()) {
      if (!cell.revealed) {
        hexCells.value.set(cellKey(cell.q, cell.r), {
          ...cell,
          revealed: true,
        });
        const row = { ...cell, revealed: true, source_client: CLIENT_ID };
        if (!row.id) delete row.id;
        updates.push(row);
      }
    }
    await useMapStore().setFogRevealAll(true);
    if (!updates.length) return;
    const { error } = await supabase
      .from("hex_cells")
      .upsert(updates, { onConflict: "map_id,q,r" });
    if (error) {
      console.error("revealAll error:", error.message);
      await init(currentSessionId.value, currentMapId.value);
    }
  }

  async function hideAll() {
    const updates = [];
    for (const cell of hexCells.value.values()) {
      if (cell.revealed) {
        hexCells.value.set(cellKey(cell.q, cell.r), {
          ...cell,
          revealed: false,
        });
        const row = { ...cell, revealed: false, source_client: CLIENT_ID };
        if (!row.id) delete row.id;
        updates.push(row);
      }
    }
    await useMapStore().setFogRevealAll(false);
    if (!updates.length) return;
    const { error } = await supabase
      .from("hex_cells")
      .upsert(updates, { onConflict: "map_id,q,r" });
    if (error) {
      console.error("hideAll error:", error.message);
      await init(currentSessionId.value, currentMapId.value);
    }
  }

  function navigateToDungeon(dungeonId) {
    const sessionId =
      currentSessionId.value ?? router.currentRoute.value.params.sessionId;
    router.push({ name: "dungeon", params: { sessionId, dungeonId } });
  }

  async function clearAll() {
    const { error } = await supabase
      .from("hex_cells")
      .delete()
      .eq("map_id", currentMapId.value);
    if (error) {
      console.error("clearAll:", error.message);
      return false;
    }
    hexCells.value = new Map();
    selectedHex.value = null;
    return true;
  }

  function cleanup() {
    if (channel) supabase.removeChannel(channel);
    channel = null;
    if (partyChannel) supabase.removeChannel(partyChannel);
    partyChannel = null;
    if (sessionChannel) supabase.removeChannel(sessionChannel);
    sessionChannel = null;
    currentMapId.value = null;
    currentSessionId.value = null;
    hexCells.value = new Map();
    selectedHex.value = null;
    partyHex.value = null;
  }

  return {
    hexCells,
    selectedHex,
    partyHex,
    selectedCell,
    hexDungeons,
    dungeonsLoading,
    loading,
    init,
    selectHex,
    deselectHex,
    upsertHex,
    addMarker,
    removeMarker,
    updateMarkerLabel,
    deleteHex,
    ensureCellExists,
    fetchDungeonsForHex,
    createDungeon,
    navigateToDungeon,
    toggleRevealed,
    revealAll,
    hideAll,
    clearAll,
    setPartyHex,
    clearPartyHex,
    cleanup,
  };
});
