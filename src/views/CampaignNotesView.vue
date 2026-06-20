<template>
  <div class="min-h-screen bg-stone-900 flex flex-col items-center py-12 px-6">
    <div class="w-full max-w-2xl">

      <div class="flex items-start gap-4 mb-8">
        <RouterLink
          to="/"
          class="mt-1 text-stone-500 hover:text-stone-300 transition-colors shrink-0"
          title="Back to campaigns"
        >
          <i class="fa-solid fa-arrow-left" />
        </RouterLink>
        <div>
          <h1 class="text-2xl font-display text-parchment-200">{{ sessionName || '…' }}</h1>
          <p class="text-stone-500 text-sm mt-0.5">Hex notes</p>
        </div>
      </div>

      <div v-if="loading" class="text-stone-500 text-sm text-center py-12">
        <i class="fa-solid fa-spinner fa-spin mr-2" />Loading notes…
      </div>

      <div
        v-else-if="!notesByMap.length"
        class="text-stone-600 text-sm text-center py-12 italic"
      >
        No hex notes for this campaign yet.
      </div>

      <div v-else class="flex flex-col gap-8">
        <section v-for="group in notesByMap" :key="group.mapId">
          <h2 class="text-xs font-display text-stone-500 uppercase tracking-widest mb-3 flex items-center gap-2">
            <i class="fa-solid fa-map text-stone-600" />
            {{ group.mapName }}
          </h2>

          <div class="flex flex-col gap-3">
            <div
              v-for="cell in group.cells"
              :key="cell.id"
              class="bg-stone-800 border border-stone-700 rounded-lg px-4 py-3"
            >
              <div class="flex items-center gap-2 mb-1.5">
                <span class="text-parchment-200 text-sm font-display">
                  {{ cell.label || `Hex (${cell.q}, ${cell.r})` }}
                </span>
                <span v-if="cell.label" class="text-stone-600 text-sm font-mono">
                  ({{ cell.q }}, {{ cell.r }})
                </span>
                <span
                  v-if="cell.terrain_type"
                  class="ml-auto text-sm text-stone-500 capitalize"
                >{{ cell.terrain_type }}</span>
              </div>
              <p class="text-stone-300 text-sm leading-relaxed whitespace-pre-wrap">{{ cell.notes }}</p>
            </div>
          </div>
        </section>
      </div>

    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { supabase } from '@/lib/supabase'
import { apiClient, ApiError } from '@/lib/apiClient.js'

const route = useRoute()
const sessionId = route.params.sessionId

const loading     = ref(true)
const sessionName = ref('')
const rawCells    = ref([])
const mapNames    = ref(new Map())

onMounted(async () => {
  const [{ data: session }, { data: maps }] = await Promise.all([
    supabase.from('sessions').select('name').eq('id', sessionId).single(),
    supabase
      .from('maps')
      .select('id, name')
      .eq('session_id', sessionId)
  ])

  if (session) sessionName.value = session.name
  mapNames.value = new Map((maps ?? []).map(map => [map.id, map.name]))

  try {
    const query = new URLSearchParams({ session_id: sessionId })
    const cells = await apiClient.get(`/hex-cells?${query.toString()}`)
    rawCells.value = cells.filter(cell => cell.notes)
  } catch (error) {
    console.error(
      'campaign notes hex load error:',
      error instanceof ApiError ? error.message : error,
    )
  }
  loading.value = false
})

const notesByMap = computed(() => {
  const groups = new Map()
  for (const cell of rawCells.value) {
    if (!groups.has(cell.map_id)) {
      groups.set(cell.map_id, {
        mapId:   cell.map_id,
        mapName: mapNames.value.get(cell.map_id) ?? 'Unknown Map',
        cells:   [],
      })
    }
    groups.get(cell.map_id).cells.push(cell)
  }
  return [...groups.values()]
})
</script>
