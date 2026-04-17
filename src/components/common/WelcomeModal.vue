<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-[200] flex items-center justify-center">
      <div class="absolute inset-0 bg-black/70 backdrop-blur-sm" @click="dismiss" />

      <div class="relative w-full max-w-lg mx-4 bg-stone-900 border border-stone-600 rounded-xl shadow-2xl flex flex-col max-h-[90vh]">
        <div class="flex items-center justify-between px-6 pt-6 pb-4 shrink-0">
          <div>
            <div class="text-xl font-display text-parchment-200 tracking-wide">⬡ Welcome to my overland & dungeon mapping tool</div>
            <div class="text-sm text-stone-400 mt-0.5">Here's a quick look at how far overboard I have gone!</div>
          </div>
          <button
            class="w-7 h-7 flex items-center justify-center text-stone-500 hover:text-stone-200 hover:bg-stone-700 rounded transition-colors shrink-0 ml-4"
            @click="dismiss"
          ><i class="fa-solid fa-xmark" /></button>
        </div>

        <div class="overflow-y-auto px-6 pb-2 flex flex-col gap-4">

          <div class="grid grid-cols-2 gap-3">

            <div class="bg-stone-800 rounded-lg p-3.5 flex flex-col gap-1.5">
              <div class="flex items-center gap-2 text-parchment-300">
                <i class="fa-solid fa-map text-base w-5 text-center" />
                <span class="text-sm font-semibold">The Map</span>
              </div>
              <p class="text-sm text-stone-400 leading-snug">Click any hex to annotate it, add notes, or link to a dungeon. Paint terrain colors and drop color-coded markers. Eventually there will be more options.</p>
            </div>

            <div class="bg-stone-800 rounded-lg p-3.5 flex flex-col gap-1.5">
              <div class="flex items-center gap-2 text-parchment-300">
                <i class="fa-solid fa-cloud text-base w-5 text-center" />
                <span class="text-sm font-semibold">Fog of War</span>
              </div>
              <p class="text-sm text-stone-400 leading-snug">The GM controls which hexes are visible to players. The GM can use the fog brush in the bottom bar to reveal or hide hexes one at a time. The players can sit there and shut up</p>
            </div>

            <div class="bg-stone-800 rounded-lg p-3.5 flex flex-col gap-1.5">
              <div class="flex items-center gap-2 text-parchment-300">
                <i class="fa-solid fa-dice text-base w-5 text-center" />
                <span class="text-sm font-semibold">Dice &amp; Chat</span>
              </div>
              <p class="text-sm text-stone-400 leading-snug">Roll any combination of dice from the sidebar, or roll stats from the character sheet. Results are shared with everyone in the session in real time. Chat is below dice. You can click the dice multiple times to add more dice, ie 1d20 -> 2d20 -> 2d20 + 1d8, etc</p>
            </div>

            <div class="bg-stone-800 rounded-lg p-3.5 flex flex-col gap-1.5">
              <div class="flex items-center gap-2 text-parchment-300">
                <i class="fa-solid fa-user text-base w-5 text-center" />
                <span class="text-sm font-semibold">Characters</span>
              </div>
              <p class="text-sm text-stone-400 leading-snug">Open your character sheet from the nav bar. Track & roll stats, HP, attacks, and gear. The GM can see all characters in the session. The random character generator at Shadow Darklings gives you the option to copy JSON. You can use that to quickly import a new character. Just paste the JSON in the Import Trashbag section of the dropdown</p>
            </div>

            <div class="bg-stone-800 rounded-lg p-3.5 flex flex-col gap-1.5">
              <div class="flex items-center gap-2 text-parchment-300">
                <i class="fa-solid fa-images text-base w-5 text-center" />
                <span class="text-sm font-semibold">Photos</span>
              </div>
              <p class="text-sm text-stone-400 leading-snug">The GM can broadcast reference images directly to all players via the Photos tab in the sidebar. The players dont really get a say in this right now</p>
            </div>

            <div class="bg-stone-800 rounded-lg p-3.5 flex flex-col gap-1.5">
              <div class="flex items-center gap-2 text-parchment-300">
                <i class="fa-solid fa-circle-info text-base w-5 text-center" />
                <span class="text-sm font-semibold">Hex Info</span>
              </div>
              <p class="text-sm text-stone-400 leading-snug">Click a hex then open the Info tab to add a label, write notes, attach items, or navigate to a dungeon map linked to that location.</p>
            </div>

          </div>

          <div class="bg-amber-950/50 border border-amber-700/40 rounded-lg p-3.5 flex gap-3">
            <i class="fa-solid fa-crown text-amber-500 mt-0.5 shrink-0" />
            <div class="flex flex-col gap-1">
              <div class="text-sm font-semibold text-amber-300">GM Tools</div>
              <p class="text-sm text-amber-200/70 leading-snug">
                Use <span class="text-amber-300 font-medium">Edit mode</span> (pencil icon) to prepare the map privately before players see it.
                When you're ready, hit <span class="text-amber-300 font-medium">Push Live</span> (upload icon) to publish changes. To switch which map the players see, hit <span class="text-amber-300 font-medium">Go Live</span> (broadcast icon).
                The <span class="text-amber-300 font-medium">Map</span> button in the nav lets you create and manage multiple maps per campaign.
              </p>
            </div>
          </div>

          <div class="bg-red-950/50 border border-red-700/40 rounded-lg p-3.5 flex gap-3">
            <i class="fa-solid fa-bug text-red-400 mt-0.5 shrink-0" />
            <div class="flex flex-col gap-1">
              <div class="text-sm font-semibold text-red-400">Report a Bug</div>
              <p class="text-sm text-stone-200/70 leading-snug">
                Use the <span class="text-red-400 font-medium"><i data-v-13c06b51="" class="fa-solid fa-bug"></i> Bug</span> button in the top nav to harass me about something being broken. Something will be broken. Lots of somethings, probably. This is a glorified sub-prototype of a larger project I've been working on this year. It isn't fully built out yet and a bunch of edge cases have probably not presented themselves in my testing. But just because I have given you an "image upload" option does not mean you should use it for penises and/or buttholes. I will take the button away. I swear to Christ.
              </p>
            </div>
          </div>

        </div>
        <div class="px-6 py-4 shrink-0 border-t border-stone-700 mt-2">
          <button
            class="w-full py-2.5 text-sm rounded-lg font-semibold bg-parchment-500 hover:bg-parchment-400 text-stone-900 transition-colors"
            @click="dismiss"
          >
            OK, you're a lunatic!
          </button>
        </div>

      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { useSessionStore } from '@/stores/sessionStore.js'
import { useAuthStore } from '@/stores/authStore.js'
import { computed } from 'vue'

const emit = defineEmits(['close'])

const sessionStore = useSessionStore()
const authStore    = useAuthStore()

const isGM = computed(() => sessionStore.isGM)

function dismiss() {
  authStore.markWelcomeSeen()
  emit('close')
}
</script>
