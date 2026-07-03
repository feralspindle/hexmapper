import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { supabase } from "@/lib/supabase";
import { realtime, usingRustRealtime } from "@/lib/realtime.js";
import { apiClient, ApiError } from "@/lib/apiClient.js";
import router from "@/router/index.js";
import { useMapStore } from "@/stores/mapStore.js";
import { useSessionStore } from "@/stores/sessionStore.js";

export const MARKER_KINDS = [
  { id: "town", label: "Town" },
  { id: "city", label: "City" },
  { id: "dungeon", label: "Dungeon" },
  { id: "landmark", label: "Landmark" },
];

export const GM_MARKER_KINDS = [
  { id: "trap", label: "Trap", badge: "T" },
  { id: "secret", label: "Secret", badge: "S" },
  { id: "encounter", label: "Encounter", badge: "E" },
  { id: "treasure", label: "Treasure", badge: "★" },
  { id: "note", label: "GM Note", badge: "!" },
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

function hiddenCellSentinel(row) {
  return {
    session_id: row.session_id,
    map_id: row.map_id,
    q: row.q,
    r: row.r,
    revealed: false,
  };
}

const PLAYER_HEX_REFRESH_MS = 5000;

export const useHexStore = defineStore("hex", () => {
  const CLIENT_ID = crypto.randomUUID();
  const hexCells = ref(new Map());
  const selectedHex = ref(null);
  const partyHex = ref(null);
  const hexDungeons = ref([]);
  const dungeonsLoading = ref(false);
  const loading = ref(false);
  const loadError = ref(null);
  const currentSessionId = ref(null);
  const currentMapId = ref(null);
  let channel = null;
  let partyChannel = null;
  let playerRefreshTimer = null;
  let playerRefreshDebounce = null;
  let playerRefreshInFlight = false;

  const selectedCell = computed(() => {
    if (!selectedHex.value) return null;
    return (
      hexCells.value.get(cellKey(selectedHex.value.q, selectedHex.value.r)) ??
      null
    );
  });

  function _replaceHexCells(rows) {
    const next = new Map();
    for (const row of rows) {
      next.set(cellKey(row.q, row.r), row);
    }
    hexCells.value = next;
  }

  async function _fetchHexRows(sessionId, mapId, isGM) {
    if (!isGM) {
      const query = new URLSearchParams({
        session_id: sessionId,
        map_id: mapId,
      });
      return apiClient.get(`/hex-cells?${query.toString()}`);
    }

    const { data, error } = await supabase
      .from("hex_cells")
      .select("*")
      .eq("map_id", mapId);

    if (error) throw error;
    return data ?? [];
  }

  async function _refreshPlayerHexes() {
    if (
      playerRefreshInFlight ||
      useSessionStore().isGM ||
      !currentSessionId.value ||
      !currentMapId.value
    ) {
      return;
    }

    const sessionId = currentSessionId.value;
    const mapId = currentMapId.value;
    playerRefreshInFlight = true;
    try {
      const rows = await _fetchHexRows(sessionId, mapId, false);
      if (
        currentSessionId.value === sessionId &&
        currentMapId.value === mapId &&
        !useSessionStore().isGM
      ) {
        _replaceHexCells(rows);
      }
    } catch (error) {
      console.error(
        "refreshPlayerHexes error:",
        error instanceof ApiError ? error.message : error,
      );
    } finally {
      playerRefreshInFlight = false;
    }
  }

  function _schedulePlayerRefresh() {
    if (playerRefreshDebounce || useSessionStore().isGM) return;
    playerRefreshDebounce = setTimeout(() => {
      playerRefreshDebounce = null;
      void _refreshPlayerHexes();
    }, 100);
  }

  function _stopPlayerRefresh() {
    if (playerRefreshTimer) clearInterval(playerRefreshTimer);
    playerRefreshTimer = null;
    if (playerRefreshDebounce) clearTimeout(playerRefreshDebounce);
    playerRefreshDebounce = null;
    playerRefreshInFlight = false;
  }

  function _notifyHexChanged() {
    void channel?.send({
      type: "broadcast",
      event: "refresh",
      payload: {},
    });
  }

  async function init(sessionId, mapId) {
    loading.value = true;
    currentSessionId.value = sessionId;
    currentMapId.value = mapId;
    hexCells.value = new Map();
    selectedHex.value = null;
    _stopPlayerRefresh();

    const isGM = useSessionStore().isGM;
    try {
      const rows = await _fetchHexRows(sessionId, mapId, isGM);
      _replaceHexCells(rows);
      loadError.value = null;
    } catch (error) {
      loadError.value = error;
      console.error(
        "hex init error:",
        error instanceof ApiError ? error.message : error,
      );
    }
    loading.value = false;

    await _loadPartyHexFromDb();

    if (channel) realtime.removeChannel(channel);
    channel = realtime
      .channel(`map:${mapId}:hex`, { sessionId, onReconnect: () => init(sessionId, mapId) })
      .on("broadcast", { event: "refresh" }, () => {
        _schedulePlayerRefresh();
      });

    if (isGM || usingRustRealtime) {
      channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "hex_cells",
          filter: `map_id=eq.${mapId}`,
        },
        handleRealtimeEvent,
      );
    } else {
      playerRefreshTimer = setInterval(
        () => void _refreshPlayerHexes(),
        PLAYER_HEX_REFRESH_MS,
      );
    }

    channel.subscribe();

    if (partyChannel) realtime.removeChannel(partyChannel);
    partyChannel = realtime
      .channel(`map:${mapId}:party`, { sessionId })
      .on("broadcast", { event: "party" }, ({ payload }) => {
        const next = payload.q != null ? { q: payload.q, r: payload.r } : null;
        const prev = partyHex.value;
        if (prev?.q === next?.q && prev?.r === next?.r) return;
        partyHex.value = next;
        _savePartyHex();
      })
      .subscribe();

    _setupMapPartyChannel(mapId);
  }

  async function _loadPartyHexFromDb() {
    const { data, error } = await supabase
      .from("maps")
      .select("party_hex_q, party_hex_r")
      .eq("id", currentMapId.value)
      .single();

    if (error) {
      console.error("_loadPartyHexFromDb error:", error.message);
      _loadPartyHex();
      return;
    }

    if (data && (data.party_hex_q !== null || data.party_hex_r !== null)) {
      partyHex.value = { q: data.party_hex_q, r: data.party_hex_r };
    } else {
      _loadPartyHex();
    }
  }

  let mapPartyChannel = null;

  function _setupMapPartyChannel(mapId) {
    if (mapPartyChannel) realtime.removeChannel(mapPartyChannel);
    mapPartyChannel = realtime
      .channel(`map:${mapId}:party_db`, { sessionId: currentSessionId.value })
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "maps",
          filter: `id=eq.${mapId}`,
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
    try {
      await apiClient.patch(`/maps/${currentMapId.value}`, { party_hex_q: q, party_hex_r: r }, "move_party");
    } catch (error) {
      console.error("setPartyHex db update error:", error instanceof ApiError ? error.message : error);
    }
    partyChannel?.send({
      type: "broadcast",
      event: "party",
      payload: { q, r },
    });
  }

  async function clearPartyHex() {
    partyHex.value = null;
    _savePartyHex();
    try {
      await apiClient.patch(`/maps/${currentMapId.value}`, { party_hex_q: null, party_hex_r: null }, "clear_party_hex");
    } catch (error) {
      console.error("clearPartyHex db update error:", error instanceof ApiError ? error.message : error);
    }
    partyChannel?.send({
      type: "broadcast",
      event: "party",
      payload: { q: null, r: null },
    });
  }

  function handleRealtimeEvent({ eventType, new: row, old }) {
    if (eventType === "INSERT" || eventType === "UPDATE") {
      if (row.source_client === CLIENT_ID) return;
      const isGM = useSessionStore().isGM;
      if (!isGM && row.revealed === false) {
        hexCells.value.set(cellKey(row.q, row.r), hiddenCellSentinel(row));
        return;
      }
      if (isGM) {
        hexCells.value.set(cellKey(row.q, row.r), row);
      } else {
        const stripped = { ...row };
        delete stripped.gm_markers;
        hexCells.value.set(cellKey(row.q, row.r), stripped);
      }
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

    // Visibility is GM-controlled in FOW. In blank mode, player-created cells
    // must be stored as revealed so they are not mistaken for hidden overrides
    // on reveal-all maps.
    const body = { ...merged };
    if (!("revealed" in patch)) {
      if (useSessionStore().hexMode === "blank") body.revealed = true;
      else delete body.revealed;
    }

    const intent = "revealed" in patch
      ? (patch.revealed ? "reveal_hex" : "hide_hex")
      : "edit_hex";

    try {
      const data = await apiClient.post("/hex-cells/upsert", body, intent);
      const stored =
        merged.gm_markers != null && data.gm_markers == null
          ? { ...data, gm_markers: merged.gm_markers }
          : data;
      hexCells.value.set(key, stored);
      _notifyHexChanged();
    } catch (error) {
      if (existing) hexCells.value.set(key, existing);
      else hexCells.value.delete(key);
      console.error("upsertHex error:", error instanceof ApiError ? error.message : error);
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

  async function addGmMarker(q, r, kind) {
    const current = parseMarkers(hexCells.value.get(cellKey(q, r))?.gm_markers);
    const next = [...current, { id: crypto.randomUUID(), kind, label: "" }];
    await upsertHex(q, r, { gm_markers: serializeMarkers(next) });
  }

  async function removeGmMarker(q, r, markerId) {
    const current = parseMarkers(hexCells.value.get(cellKey(q, r))?.gm_markers);
    const next = current.filter((m) => m.id !== markerId);
    await upsertHex(q, r, { gm_markers: serializeMarkers(next) });
  }

  async function updateGmMarkerLabel(q, r, markerId, label) {
    const current = parseMarkers(hexCells.value.get(cellKey(q, r))?.gm_markers);
    const next = current.map((m) => (m.id === markerId ? { ...m, label } : m));
    await upsertHex(q, r, { gm_markers: serializeMarkers(next) });
  }

  async function deleteHex(q, r) {
    const key = cellKey(q, r);
    const backup = hexCells.value.get(key);
    hexCells.value.delete(key);
    selectedHex.value = null;

    try {
      await apiClient.post("/hex-cells/delete", {
        session_id: currentSessionId.value,
        map_id: currentMapId.value,
        q,
        r,
      }, "delete_hex");
      _notifyHexChanged();
    } catch (error) {
      if (backup) hexCells.value.set(key, backup);
      console.error("deleteHex error:", error instanceof ApiError ? error.message : error);
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
      try {
        const data = await apiClient.post("/hex-cells/upsert", {
          session_id: currentSessionId.value,
          map_id: currentMapId.value,
          q,
          r,
          has_dungeon: true,
          source_client: CLIENT_ID,
        }, "create_dungeon");
        hexId = data.id;
        hexCells.value.set(key, data);
      } catch (error) {
        console.error("createDungeon upsert hex error:", error instanceof ApiError ? error.message : error);
        return;
      }
    } else if (!cell.has_dungeon) {
      await upsertHex(q, r, { has_dungeon: true });
    }

    let data;
    try {
      data = await apiClient.post("/dungeons", {
        session_id: currentSessionId.value,
        hex_id: hexId,
        name,
      }, "create_dungeon");
    } catch (error) {
      console.error("createDungeon insert error:", error instanceof ApiError ? error.message : error);
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

    try {
      const data = await apiClient.post("/hex-cells/upsert", {
        session_id: currentSessionId.value,
        map_id: currentMapId.value,
        q,
        r,
        source_client: CLIENT_ID,
      }, "ensure_hex");
      hexCells.value.set(key, data);
      return data.id;
    } catch (error) {
      console.error("ensureCellExists error:", error instanceof ApiError ? error.message : error);
      return null;
    }
  }

  async function toggleRevealed(q, r) {
    const current = hexCells.value.get(cellKey(q, r))?.revealed ?? false;
    await upsertHex(q, r, { revealed: !current });
  }

  async function _bulkReveal(revealed) {
    for (const cell of hexCells.value.values()) {
      if (cell.revealed !== revealed) {
        hexCells.value.set(cellKey(cell.q, cell.r), { ...cell, revealed });
      }
    }
    await useMapStore().setFogRevealAll(revealed);
    try {
      await apiClient.post("/hex-cells/bulk-reveal", {
        session_id: currentSessionId.value,
        map_id: currentMapId.value,
        revealed,
      }, revealed ? "reveal_all_hexes" : "hide_all_hexes");
      _notifyHexChanged();
    } catch (error) {
      console.error("bulkReveal error:", error instanceof ApiError ? error.message : error);
      await init(currentSessionId.value, currentMapId.value);
    }
  }

  async function revealAll() {
    await _bulkReveal(true);
  }

  async function hideAll() {
    await _bulkReveal(false);
  }

  function navigateToDungeon(dungeonId) {
    const sessionId =
      currentSessionId.value ?? router.currentRoute.value.params.sessionId;
    router.push({ name: "dungeon", params: { sessionId, dungeonId } });
  }

  async function clearAll() {
    try {
      await apiClient.post("/hex-cells/clear", {
        session_id: currentSessionId.value,
        map_id: currentMapId.value,
      }, "clear_hexes");
    } catch (error) {
      console.error("clearAll:", error instanceof ApiError ? error.message : error);
      return false;
    }
    hexCells.value = new Map();
    selectedHex.value = null;
    _notifyHexChanged();
    return true;
  }

  function cleanup() {
    _stopPlayerRefresh();
    if (channel) realtime.removeChannel(channel);
    channel = null;
    if (partyChannel) realtime.removeChannel(partyChannel);
    partyChannel = null;
    if (mapPartyChannel) realtime.removeChannel(mapPartyChannel);
    mapPartyChannel = null;
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
    loadError,
    init,
    selectHex,
    deselectHex,
    upsertHex,
    addMarker,
    removeMarker,
    updateMarkerLabel,
    addGmMarker,
    removeGmMarker,
    updateGmMarkerLabel,
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
