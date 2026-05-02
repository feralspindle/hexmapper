<template>
  <div v-if="isStaging" class="relative" ref="containerEl" style="align-self:stretch;display:flex;align-items:center">
    <button
      class="ds-tb-btn"
      :class="{ active: open }"
      style="color: #f87171"
      title="Report a bug (staging only)"
      @click="open = !open"
    >
      <i class="fa-solid fa-bug" style="font-size:13px" />
      <span v-if="label" class="hidden sm:inline">{{ label }}</span>
    </button>
    <Transition name="bug-dropdown">
      <div v-if="open" class="br-menu">
        <div class="br-header">
          <i class="fa-solid fa-bug" style="font-size:12px;color:#c0392b" />
          <span class="br-title">Report a Bug</span>
          <button class="br-close" @click="open = false">&times;</button>
        </div>

        <div class="br-body">
          <div class="br-meta">
            <div><span class="br-meta-key">Area:</span> {{ collectedMeta.area }}</div>
            <div v-if="collectedMeta.session_name"><span class="br-meta-key">Session:</span> {{ collectedMeta.session_name }}</div>
            <div v-if="collectedMeta.viewer_count != null"><span class="br-meta-key">Users:</span> {{ collectedMeta.viewer_count }}</div>
            <div><span class="br-meta-key">Viewport:</span> {{ collectedMeta.viewport_width }}×{{ collectedMeta.viewport_height }}</div>
            <div><span class="br-meta-key">Browser:</span> {{ collectedMeta.browser_summary }}</div>
          </div>

          <div>
            <label class="br-label">What dun broke?</label>
            <textarea
              v-model="description"
              placeholder="Describe the problem..."
              rows="4"
              maxlength="2000"
              class="br-textarea"
            />
          </div>

          <div>
            <label class="br-label">
              Screenshot <span class="br-label-note">(optional but helpful. no penises or buttholes please)</span>
            </label>
            <div class="br-drop" :class="{ 'br-drop--filled': previewUrl }">
              <img v-if="previewUrl" :src="previewUrl" style="width:100%;max-height:120px;object-fit:cover;display:block" />
              <div v-else class="br-drop-prompt">
                <i class="fa-solid fa-image" />
                <span>Click to attach image</span>
              </div>
              <input type="file" accept="image/*" class="br-file-input" @change="onFile" />
              <button v-if="previewUrl" class="br-clear" @click.prevent="clearFile">✕</button>
            </div>
          </div>

          <button
            class="br-submit"
            :class="{ 'br-submit--disabled': !description.trim() || submitting }"
            :disabled="!description.trim() || submitting"
            @click="submit"
          >
            <i v-if="submitting" class="fa-solid fa-spinner fa-spin" style="margin-right:4px" />
            {{ submitting ? 'Submitting…' : 'Submit Bug Report' }}
          </button>

          <p v-if="submitted" class="br-success"><i class="fa-solid fa-check" style="margin-right:4px" />Thanks! Report submitted.</p>
          <p v-if="submitError" class="br-error">{{ submitError }}</p>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import { useSessionStore } from '@/stores/sessionStore.js'
import { useAuthStore } from '@/stores/authStore.js'
import { supabase } from '@/lib/supabase.js'
import { activeNavDropdown } from '@/composables/useNavDropdown.js'

const props = defineProps({ label: { type: String, default: '' } })

const isStaging = import.meta.env.VITE_APP_ENV === 'staging'

const route        = useRoute()
const sessionStore = useSessionStore()
const authStore    = useAuthStore()

const open          = ref(false)
const description   = ref('')
const screenshotFile = ref(null)
const previewUrl    = ref(null)
const submitting    = ref(false)
const submitted     = ref(false)
const submitError   = ref(null)
const containerEl   = ref(null)

function areaFromRoute(name) {
  const map = {
    'hex-map':        'Hex Map',
    'dungeon':        'Dungeon',
    'home':           'Home',
    'campaign-notes': 'Campaign Notes',
  }
  return map[name] ?? (name ? String(name) : 'Unknown')
}

function browserSummary() {
  const ua = navigator.userAgent
  if (ua.includes('Firefox'))       return 'Firefox'
  if (ua.includes('Edg'))           return 'Edge'
  if (ua.includes('Chrome'))        return 'Chrome'
  if (ua.includes('Safari'))        return 'Safari'
  return ua.slice(0, 40)
}

const collectedMeta = computed(() => ({
  area:             areaFromRoute(route.name),
  route_name:       route.name ?? 'unknown',
  url:              window.location.href,
  session_id:       sessionStore.sessionId   ?? null,
  session_name:     sessionStore.sessionName ?? null,
  viewer_count:     null,
  user_agent:       navigator.userAgent,
  browser_summary:  browserSummary(),
  language:         navigator.language,
  viewport_width:   window.innerWidth,
  viewport_height:  window.innerHeight,
  submitted_at:     new Date().toISOString(),
}))

function onFile(e) {
  const file = e.target.files?.[0]
  if (!file) return
  screenshotFile.value = file
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
  previewUrl.value = URL.createObjectURL(file)
}

function clearFile() {
  screenshotFile.value = null
  if (previewUrl.value) { URL.revokeObjectURL(previewUrl.value); previewUrl.value = null }
}

function reset() {
  description.value = ''
  clearFile()
  submitted.value   = false
  submitError.value = null
  submitting.value  = false
}
async function submit() {
  if (!description.value.trim() || submitting.value) return
  submitting.value  = true
  submitError.value = null

  try {
    let screenshotPath = null

    if (screenshotFile.value) {
      const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
      const EXT_MAP = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' }
      const mimeType = screenshotFile.value.type
      if (!ALLOWED_TYPES.includes(mimeType)) throw new Error('Only image files are allowed')
      const ext  = EXT_MAP[mimeType] ?? 'jpg'
      // Upload into per-user folder so storage policy can enforce ownership
      const path = `${authStore.user?.id}/${Date.now()}-${crypto.randomUUID()}.${ext}`
      const { error: uploadErr } = await supabase.storage
        .from('bug-screenshots')
        .upload(path, screenshotFile.value, { contentType: mimeType })
      if (!uploadErr) screenshotPath = path
    }

    const { error } = await supabase.from('bug_reports').insert({
      user_id:         authStore.user?.id   ?? null,
      display_name:    authStore.displayName ?? null,
      description:     description.value.trim(),
      screenshot_path: screenshotPath,
      metadata:        collectedMeta.value,
    })

    if (error) throw error

    submitted.value = true
    setTimeout(() => { open.value = false; reset() }, 2000)
  } catch (err) {
    submitError.value = 'Failed to submit — please try again.'
    console.error('Bug report:', err)
  } finally {
    submitting.value = false
  }
}

watch(open, (val) => {
  if (val) activeNavDropdown.value = 'bug-report'
  else if (activeNavDropdown.value === 'bug-report') activeNavDropdown.value = null
})
watch(activeNavDropdown, (val) => {
  if (val !== null && val !== 'bug-report') open.value = false
})

function onClickOutside(e) {
  if (containerEl.value && !containerEl.value.contains(e.target)) open.value = false
}

onMounted(()   => document.addEventListener('mousedown', onClickOutside))
onUnmounted(() => document.removeEventListener('mousedown', onClickOutside))
</script>

<style scoped>
.bug-dropdown-enter-active { transition: all 0.15s ease-out; }
.bug-dropdown-leave-active { transition: all 0.1s ease-in; }
.bug-dropdown-enter-from   { opacity: 0; transform: translateY(-6px); }
.bug-dropdown-leave-to     { opacity: 0; transform: translateY(-6px); }

.br-menu {
  position: absolute;
  top: 100%; right: 0;
  margin-top: 0;
  width: 320px;
  z-index: 200;
  background: var(--paper, #ede1c7);
  border: 1px solid var(--rule-strong, rgba(26,20,16,.42));
  box-shadow: 0 8px 24px rgba(0,0,0,.28), 0 2px 6px rgba(0,0,0,.14);
  font-family: var(--font-body, "Cormorant Garamond", Georgia, serif);
  overflow: hidden;
}
.br-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px 6px;
  border-bottom: 1px solid var(--rule-strong, rgba(26,20,16,.42));
}
.br-title {
  flex: 1;
  font-family: var(--font-zine, "Special Elite", monospace);
  font-size: 10px;
  letter-spacing: .12em;
  text-transform: uppercase;
  color: var(--ink-mute, #8a7a68);
}
.br-close {
  background: transparent;
  border: none;
  color: var(--ink-mute, #8a7a68);
  font-size: 16px;
  line-height: 1;
  cursor: default;
  transition: color .1s;
  padding: 0 2px;
}
.br-close:hover { color: var(--ink, #1a1410); }
.br-body { padding: 12px; display: flex; flex-direction: column; gap: 10px; }
.br-meta {
  background: var(--paper-2, #e3d4b3);
  border: 1px solid var(--rule, rgba(26,20,16,.18));
  padding: 7px 9px;
  font-family: var(--font-mono, monospace);
  font-size: 10.5px;
  color: var(--ink-2, #3a2e22);
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.br-meta-key { color: var(--ink-mute, #8a7a68); }
.br-label {
  display: block;
  font-family: var(--font-zine, "Special Elite", monospace);
  font-size: 9.5px;
  letter-spacing: .08em;
  text-transform: uppercase;
  color: var(--ink-mute, #8a7a68);
  margin-bottom: 5px;
}
.br-label-note { font-family: var(--font-body, Georgia, serif); text-transform: none; letter-spacing: 0; font-size: 10px; }
.br-textarea {
  width: 100%;
  background: var(--paper-2, #e3d4b3);
  border: 1px solid var(--rule-strong, rgba(26,20,16,.42));
  padding: 6px 8px;
  font-family: var(--font-body, Georgia, serif);
  font-size: 13px;
  color: var(--ink, #1a1410);
  resize: none;
  outline: none;
  transition: border-color .15s;
}
.br-textarea:focus { border-color: var(--accent, #8a1c1c); }
.br-textarea::placeholder { color: var(--ink-mute, #8a7a68); font-style: italic; }
.br-drop {
  position: relative;
  border: 1px dashed var(--rule-strong, rgba(26,20,16,.42));
  overflow: hidden;
  transition: border-color .15s;
  cursor: pointer;
}
.br-drop:hover:not(.br-drop--filled) { border-color: var(--ink-mute, #8a7a68); }
.br-drop--filled { border-style: solid; }
.br-drop-prompt {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 10px;
  font-size: 12px;
  color: var(--ink-mute, #8a7a68);
}
.br-file-input {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
  width: 100%;
  height: 100%;
}
.br-clear {
  position: absolute;
  top: 4px; right: 4px;
  background: rgba(26,20,16,.7);
  border: none;
  color: #e7e5e4;
  font-size: 11px;
  padding: 2px 6px;
  cursor: default;
  transition: background .1s;
}
.br-clear:hover { background: rgba(26,20,16,.9); }
.br-submit {
  width: 100%;
  padding: 7px;
  background: #8a1c1c;
  color: #ede1c7;
  border: none;
  font-family: var(--font-zine, "Special Elite", monospace);
  font-size: 11px;
  letter-spacing: .08em;
  text-transform: uppercase;
  cursor: default;
  transition: background .12s;
}
.br-submit:hover:not(:disabled) { background: #a52020; }
.br-submit--disabled { background: var(--paper-2, #e3d4b3); color: var(--ink-mute, #8a7a68); cursor: not-allowed; }
.br-success { font-size: 12px; color: #3a6b3a; text-align: center; margin: 0; }
.br-error   { font-size: 12px; color: var(--accent, #8a1c1c); text-align: center; margin: 0; }
</style>
