<template>
  <div class="ds-contents-bar">
    <span class="ds-cb-label">Contents</span>
    <button
      v-for="item in STAMP_TYPES"
      :key="item.type"
      class="ds-stamp-btn"
      :aria-pressed="selectedStamp === item.type ? 'true' : 'false'"
      :title="item.label"
      @mousedown.prevent="onMouseDown($event, item)"
      @click="selectStamp(item.type)"
    >

      <component :is="item.icon" :size="20" />
      <span class="ds-stamp-lbl">{{ item.label }}</span>
    </button>
  </div>
</template>

<script setup>
import { ref, h } from 'vue'
import { useItemDrag } from '@/composables/useItemDrag.js'

const { startDrag } = useItemDrag()

const selectedStamp = ref(null)

const emit = defineEmits(['select'])

/* inline stamp SVG glyphs lifted from design icons.jsx */
const make = (paths) => ({
  props: ['size'],
  render() {
    return h('svg', { width: this.size ?? 20, height: this.size ?? 20, viewBox: '0 0 24 24', fill: 'currentColor' }, paths)
  },
})

const MonsterIcon  = make([h('path', { d: 'M12 3c-4 0-7 3-7 7v3l-2 2v3l3-1 2 2 4-1 4 1 2-2 3 1v-3l-2-2v-3c0-4-3-7-7-7zm-3 7a1.3 1.3 0 110 2.6 1.3 1.3 0 010-2.6zm6 0a1.3 1.3 0 110 2.6 1.3 1.3 0 010-2.6zM9 16h6l-1 2h-4z' })])
const TreasureIcon = make([h('path', { d: 'M3 9h18v11H3z', opacity: '.85' }), h('path', { d: 'M3 7l3-3h12l3 3v2H3z' }), h('rect', { x: 10, y: 11, width: 4, height: 5, fill: 'var(--ink)' })])
const TrapIcon     = make([h('path', { d: 'M3 4h18l-2 5h-5l-2 4-2-4H5z' }), h('path', { d: 'M5 9l7 11 7-11', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.5 })])
const FeatureIcon  = make([h('path', { d: 'M5 21V8l7-5 7 5v13H5z', opacity: '.25' }), h('path', { d: 'M5 21V8l7-5 7 5v13', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.6, 'stroke-linejoin': 'round' }), h('path', { d: 'M10 21v-6h4v6', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.4 })])
const NpcIcon      = make([h('circle', { cx: 12, cy: 8, r: 4 }), h('path', { d: 'M4 21c0-4 4-7 8-7s8 3 8 7' })])
const DoorIcon2    = make([h('path', { d: 'M6 21V4a1 1 0 011-1h10a1 1 0 011 1v17M4 21h16M14 12h.01' })])
const SecretIcon   = make([h('path', { d: 'M3 12s3-7 9-7 9 7 9 7-3 7-9 7-9-7-9-7z' }), h('circle', { cx: 12, cy: 12, r: 2.5, fill: 'var(--ink)' })])
const AltarIcon    = make([h('path', { d: 'M5 20V10h14v10z', opacity: '.3' }), h('path', { d: 'M5 20V10h14v10M3 10h18M9 10V6h6v4' })])

const STAMP_TYPES = [
  { type: 'monster',  label: 'Monster',  icon: MonsterIcon,  faClass: 'ra ra-monster-skull' },
  { type: 'treasure', label: 'Treasure', icon: TreasureIcon, faClass: 'fa-solid fa-box-open' },
  { type: 'trap',     label: 'Trap',     icon: TrapIcon,     faClass: 'ra ra-bear-trap' },
  { type: 'feature',  label: 'Feature',  icon: FeatureIcon,  faClass: 'ra ra-scroll-unfurled' },
  { type: 'npc',      label: 'NPC',      icon: NpcIcon,      faClass: 'ra ra-hood' },
  { type: 'body',     label: 'Body',     icon: DoorIcon2,    faClass: 'ra ra-skull' },
  { type: 'secret',   label: 'Secret',   icon: SecretIcon,   faClass: 'ra ra-eye' },
  { type: 'key',      label: 'Key',      icon: AltarIcon,    faClass: 'ra ra-key' },
]

function selectStamp(type) {
  selectedStamp.value = selectedStamp.value === type ? null : type
  emit('select', selectedStamp.value)
}

function onMouseDown(e, item) {
  startDrag(item.type, item.faClass, e.clientX, e.clientY)
}

defineExpose({ selectedStamp })
</script>
