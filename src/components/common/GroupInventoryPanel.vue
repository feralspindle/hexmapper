<template>
    <div v-if="visible" class="ds-party-panel ds-inv-panel" :style="{ left: pos.x + 'px', top: pos.y + 'px' }">
        <div class="ds-party-head" @mousedown="startDrag">
            <div class="ds-grip">
                <span v-for="i in 6" :key="i" />
            </div>

            <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.6"
                stroke-linecap="round"
                stroke-linejoin="round"
                style="color: var(--paper-3); flex: 0 0 auto"
            >
                <path d="M9 9V7a3 3 0 016 0v2" />
                <rect x="4" y="9" width="16" height="12" rx="2" />
            </svg>

            <h4>Party Inventory</h4>
            <span class="ds-party-meta">{{ allGear.length }} items</span>

            <button
                class="ds-panel-action"
                :style="collapsed ? 'transform:rotate(-90deg)' : ''"
                @click.stop="collapsed = !collapsed"
            >
                <svg
                    width="10"
                    height="10"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2.5"
                    stroke-linecap="round"
                >
                    <path d="M6 9l6 6 6-6" />
                </svg>
            </button>

            <button class="ds-panel-action" @click.stop="closePanel()">
                <svg
                    width="10"
                    height="10"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2.5"
                    stroke-linecap="round"
                >
                    <path d="M18 6L6 18M6 6l12 12" />
                </svg>
            </button>
        </div>

        <div v-if="!collapsed" class="ds-party-body ds-inv-body">
            <div v-if="!allGear.length" class="ds-inv-empty">No gear in the party</div>
            <div v-for="(item, i) in allGear" :key="i" class="ds-inv-row">
                <span class="ds-inv-name">{{ item.itemName }}</span>
                <span class="ds-inv-qty">{{ item.quantity > 1 ? `×${item.quantity}` : '' }}</span>
                <span class="ds-inv-char">{{ item.characterName }}</span>
            </div>
        </div>
    </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useCharacterStore } from '@/stores/characterStore.js'
import { useGroupInventory } from '@/composables/useGroupInventory.js'

const characterStore = useCharacterStore()
const { visible, close } = useGroupInventory()

function closePanel() { close() }

const STORAGE_KEY = 'dm.groupInventory.pos'
const DEFAULT_POS = { x: 80, y: 240 }

const pos = ref({ ...DEFAULT_POS })
const collapsed = ref(false)

onMounted(() => {
    try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
        if (saved?.x !== undefined) pos.value = saved
    } catch {}
})

function persistPos() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pos.value))
}

let dragStart = null

function startDrag(e) {
    dragStart = { mx: e.clientX, my: e.clientY, px: pos.value.x, py: pos.value.y }
    window.addEventListener('mousemove', onDragMove)
    window.addEventListener('mouseup', onDragUp)
}
function onDragMove(e) {
    if (!dragStart) return
    pos.value = {
        x: Math.max(0, dragStart.px + (e.clientX - dragStart.mx)),
        y: Math.max(0, dragStart.py + (e.clientY - dragStart.my)),
    }
}
function onDragUp() {
    dragStart = null
    persistPos()
    window.removeEventListener('mousemove', onDragMove)
    window.removeEventListener('mouseup', onDragUp)
}
onUnmounted(() => {
    window.removeEventListener('mousemove', onDragMove)
    window.removeEventListener('mouseup', onDragUp)
})

const allGear = computed(() => {
    const items = []
    for (const char of characterStore.characters) {
        const charName = char.data?.name || 'Unknown'
        for (const item of (char.data?.gear ?? [])) {
            if (item.disabled) continue
            items.push({
                itemName: item.name,
                characterName: charName,
                quantity: item.quantity ?? 1,
            })
        }
    }
    return items.sort((a, b) =>
        a.itemName.localeCompare(b.itemName, undefined, { sensitivity: 'base' })
    )
})
</script>
