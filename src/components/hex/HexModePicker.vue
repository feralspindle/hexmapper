<template>
  <div class="hm-mode-picker">

    <div class="hm-mode-picker-head">
      <h1>Begin overland map</h1>
      <p>Pick how the party will map this region. <b>This sets the rules of the page.</b> You can switch later, but choose deliberately — the two modes don't mix.</p>
    </div>

    <div class="hm-mode-picker-grid">

      <div class="hm-mode-card">
        <div class="hm-mode-icon">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 8h18M5 12h14M3 16h18M7 20h10"/>
          </svg>
        </div>
        <h2>Fog of War</h2>
        <p class="hm-mode-tagline">GM has a map.</p>
        <ul class="hm-mode-bullets">
          <li>You upload a region map</li>
          <li>The map is hidden under fog</li>
          <li>Reveal hexes as the party explores</li>
          <li>Players still drop pins &amp; take notes</li>
        </ul>

        <template v-if="!bgUrl">
          <button
            class="ds-btn"
            style="width:100%;justify-content:center;padding:10px 14px;display:flex;align-items:center;gap:8px"
            @click="fileRef?.click()"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 3v14M6 9l6-6 6 6"/><path d="M3 21h18"/>
            </svg>
            Upload region map
          </button>
          <input ref="fileRef" type="file" accept="image/*" style="display:none" @change="handleFile" />
          <button
            class="ds-btn ghost"
            style="width:100%;justify-content:center;margin-top:6px"
            @click="$emit('pick-fow', null)"
          >Or use existing map</button>
        </template>

        <template v-else>
          <div class="hm-mode-preview">
            <img :src="bgUrl" alt="" />
          </div>
          <button
            class="ds-btn"
            style="width:100%;justify-content:center;padding:10px 14px;background:var(--accent);border-color:var(--accent)"
            @click="$emit('pick-fow', pendingFile)"
          >Begin with this map →</button>
          <button
            class="ds-btn ghost"
            style="width:100%;justify-content:center;margin-top:6px"
            @click="bgUrl = null; pendingFile = null"
          >Choose different</button>
        </template>
      </div>

      <div class="hm-mode-card">
        <div class="hm-mode-icon">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 2l8 5v10l-8 5-8-5V7z"/>
          </svg>
        </div>
        <h2>Blank Slate</h2>
        <p class="hm-mode-tagline">No GM map. Players draw it.</p>
        <ul class="hm-mode-bullets">
          <li>Empty hex grid to start</li>
          <li>Players paint terrain as they travel</li>
          <li>Mark towns, dungeons, landmarks</li>
          <li>Annotate hexes with what you find</li>
        </ul>
        <div style="flex:1" />
        <button
          class="ds-btn"
          style="width:100%;justify-content:center;padding:10px 14px;background:var(--accent-3);border-color:var(--accent-3)"
          @click="$emit('pick-blank')"
        >Begin with empty grid →</button>
      </div>

    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

defineEmits(['pick-fow', 'pick-blank'])

const fileRef   = ref(null)
const bgUrl     = ref(null)
const pendingFile = ref(null)

function handleFile(e) {
  const file = e.target.files?.[0]
  if (!file) return
  pendingFile.value = file
  const reader = new FileReader()
  reader.onload = (ev) => { bgUrl.value = ev.target.result }
  reader.readAsDataURL(file)
}
</script>
