<template>
  <div v-if="isStaging" class="relative" ref="containerEl">
    <button
      class="flex items-center gap-1.5 text-xs px-2 py-1 rounded transition-colors text-red-500 hover:text-red-400 hover:bg-stone-800"
      title="Report a bug (staging only)"
      @click="open = !open"
    >
      <i class="fa-solid fa-bug" />
      <span class="hidden sm:inline text-[11px]">Bug</span>
    </button>
    <Transition name="bug-dropdown">
      <div
        v-if="open"
        class="absolute top-full right-0 mt-1.5 w-80 bg-stone-900 border border-stone-700 rounded-lg shadow-2xl shadow-black/70 z-[200] overflow-hidden"
      >
        <div class="px-4 py-2.5 border-b border-stone-700 flex items-center gap-2">
          <i class="fa-solid fa-bug text-red-500 text-xs" />
          <span class="text-stone-200 text-sm font-display">Report a Bug</span>
          <button
            class="ml-auto text-stone-500 hover:text-stone-300 text-lg leading-none transition-colors"
            @click="open = false"
          >&times;</button>
        </div>

        <div class="p-4 space-y-3">
          <div class="text-[12px] text-stone-500 bg-stone-800/60 rounded px-2.5 py-2 space-y-0.5 border border-stone-700/50">
            <div><span class="text-stone-600">Area:</span> {{ collectedMeta.area }}</div>
            <div v-if="collectedMeta.session_name">
              <span class="text-stone-600">Session:</span> {{ collectedMeta.session_name }}
            </div>
            <div v-if="collectedMeta.viewer_count != null">
              <span class="text-stone-600">Users in session:</span> {{ collectedMeta.viewer_count }}
            </div>
            <div>
              <span class="text-stone-600">Viewport:</span>
              {{ collectedMeta.viewport_width }}×{{ collectedMeta.viewport_height }}
            </div>
            <div>
              <span class="text-stone-600">Browser:</span> {{ collectedMeta.browser_summary }}
            </div>
          </div>

          <div>
            <label class="block text-sm text-stone-400 mb-1">What dun broke?</label>
            <textarea
              v-model="description"
              placeholder="Describe the problem..."
              rows="4"
              maxlength="2000"
              class="w-full bg-stone-800 border border-stone-700 rounded px-2.5 py-2 text-xs text-stone-100 placeholder-stone-600 focus:outline-none focus:border-parchment-400 resize-none"
            />
          </div>
          <div>
            <label class="block text-sm text-stone-400 mb-1">
              Screenshot of the broke shit <span class="text-stone-500">(optional but super helpful usually. please dont send me a penis)</span>
            </label>
            <div
              class="relative border border-dashed rounded overflow-hidden transition-colors"
              :class="previewUrl ? 'border-stone-600' : 'border-stone-700 hover:border-stone-500'"
            >
              <img v-if="previewUrl" :src="previewUrl" class="w-full max-h-32 object-cover" />
              <div v-else class="flex items-center justify-center gap-2 text-stone-600 text-xs py-3 cursor-pointer">
                <i class="fa-solid fa-image" />
                <span>Click to attach image (NOT of a PENIS)</span>
              </div>
              <input
                type="file"
                accept="image/*"
                class="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                @change="onFile"
              />
              <button
                v-if="previewUrl"
                class="absolute top-1 right-1 bg-stone-900/80 rounded text-stone-400 hover:text-stone-200 text-xs px-1.5 py-0.5 transition-colors"
                @click.prevent="clearFile"
              >✕</button>
            </div>
          </div>

          <button
            :disabled="!description.trim() || submitting"
            class="w-full py-2 rounded font-display text-sm transition-colors"
            :class="description.trim() && !submitting
              ? 'bg-red-800 hover:bg-red-700 text-white'
              : 'bg-stone-800 text-stone-600 cursor-not-allowed border border-stone-700'"
            @click="submit"
          >
            <i v-if="submitting" class="fa-solid fa-spinner fa-spin mr-1.5" />
            {{ submitting ? 'Submitting...' : 'Submit Bug Report' }}
          </button>

          <p v-if="submitted" class="text-green-400 text-xs text-center">
            <i class="fa-solid fa-check mr-1" />Thanks! Report submitted.
          </p>
          <p v-if="submitError" class="text-red-400 text-xs text-center">{{ submitError }}</p>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import { useSessionStore } from '@/stores/sessionStore.js'
import { useAuthStore } from '@/stores/authStore.js'
import { supabase } from '@/lib/supabase.js'

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
      const ext  = screenshotFile.value.name.split('.').pop()
      const path = `${Date.now()}-${crypto.randomUUID()}.${ext}`
      const { error: uploadErr } = await supabase.storage
        .from('bug-screenshots')
        .upload(path, screenshotFile.value)
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
</style>
