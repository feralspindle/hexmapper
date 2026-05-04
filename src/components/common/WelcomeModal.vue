<template>
  <Teleport to="body">
    <div class="ds-wm-overlay">
      <div class="ds-wm-backdrop" @click="dismiss" />

      <div class="ds-wm-panel">

        <div class="ds-wm-head">
          <span class="ds-wm-glyph">⬡</span>
          <div class="ds-wm-title-wrap">
            <h2 class="ds-wm-title">Welcome to my overland &amp; dungeon mapping tool</h2>
            <p class="ds-wm-subtitle">Here's a quick look at how far overboard I have gone!</p>
          </div>
          <button class="ds-wm-close" @click="dismiss"><i class="fa-solid fa-xmark" /></button>
        </div>

        <div class="ds-wm-body">
          <div class="ds-wm-grid">
            <div v-for="item in features" :key="item.title" class="ds-wm-card">
              <div class="ds-wm-card-head">
                <i :class="[item.icon, 'ds-wm-icon']" />
                <span class="ds-wm-card-title">{{ item.title }}</span>
              </div>
              <p class="ds-wm-card-body">{{ item.body }}</p>
            </div>
          </div>

          <div class="ds-wm-note ds-wm-note--gold">
            <i class="fa-solid fa-crown ds-wm-note-icon" />
            <div>
              <div class="ds-wm-note-head">GM Tools</div>
              <p class="ds-wm-note-body">
                Use <strong>Edit mode</strong> (pencil icon) to prepare the map privately before players see it.
                When you're ready, hit <strong>Push Live</strong> (upload icon) to publish changes. To switch which map the players see, hit <strong>Go Live</strong> (broadcast icon).
                The <strong>Map</strong> button in the nav lets you create and manage multiple maps per campaign.
              </p>
            </div>
          </div>

          <div class="ds-wm-note ds-wm-note--red">
            <i class="fa-solid fa-bug ds-wm-note-icon" />
            <div>
              <div class="ds-wm-note-head">Report a Bug</div>
              <p class="ds-wm-note-body">
                Use the <strong><i class="fa-solid fa-bug"></i> Bug</strong> button in the top nav to harass me about something being broken.
                Something will be broken. Lots of somethings, probably. This is a glorified sub-prototype of a larger project I've been working on this year.
                It isn't fully built out yet and a bunch of edge cases have probably not presented themselves in my testing.
                But just because I have given you an "image upload" option does not mean you should use it for penises and/or buttholes. I will take the button away. I swear to Christ.
              </p>
            </div>
          </div>
        </div>

        <div class="ds-wm-footer">
          <button class="ds-wm-btn" @click="dismiss">OK, you're a lunatic!</button>
        </div>

      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { useSessionStore } from '@/stores/sessionStore.js'
import { useAuthStore } from '@/stores/authStore.js'

const emit = defineEmits(['close'])

const sessionStore = useSessionStore()
const authStore    = useAuthStore()

const features = [
  {
    icon: 'fa-solid fa-map',
    title: 'The Map',
    body: 'Click any hex to annotate it, add notes, or link to a dungeon. Paint terrain colors and drop color-coded markers. Eventually there will be more options.',
  },
  {
    icon: 'fa-solid fa-cloud',
    title: 'Fog of War',
    body: "The GM controls which hexes are visible to players. The GM can use the fog brush in the bottom bar to reveal or hide hexes one at a time. The players can sit there and shut up.",
  },
  {
    icon: 'fa-solid fa-dice',
    title: 'Dice & Chat',
    body: 'Roll any combination of dice from the sidebar, or roll stats from the character sheet. Results are shared with everyone in real time. You can click dice multiple times to add more: 1d20 → 2d20 → 2d20+1d8, etc.',
  },
  {
    icon: 'fa-solid fa-user',
    title: 'Characters',
    body: "Open your character sheet from the nav bar. Track & roll stats, HP, attacks, and gear. The GM can see all characters in the session. Import a character via the Shadow Darklings JSON export — just paste it in the Import Trashbag section of the dropdown.",
  },
  {
    icon: 'fa-solid fa-images',
    title: 'Photos',
    body: "The GM can broadcast reference images directly to all players via the Photos tab in the sidebar. The players don't really get a say in this right now.",
  },
  {
    icon: 'fa-solid fa-circle-info',
    title: 'Hex Info',
    body: 'Click a hex then open the Info tab to add a label, write notes, attach items, or navigate to a dungeon map linked to that location.',
  },
]

function dismiss() {
  authStore.markWelcomeSeen()
  emit('close')
}
</script>

<style scoped>
.ds-wm-overlay {
  position: fixed; inset: 0; z-index: 200;
  display: flex; align-items: center; justify-content: center;
  --ink: #1a1410; --ink-2: #3a2e22; --ink-soft: #5a4a3a; --ink-mute: #8a7a68;
  --paper: #ede1c7; --paper-2: #e3d4b3; --paper-3: #d8c69e;
  --rule: rgba(26,20,16,.18); --rule-strong: rgba(26,20,16,.42);
  --accent: #8a1c1c; --accent-2: #b8541c; --accent-3: #5a6b3a; --gold: #b89c2a;
  --font-display: "IM Fell English","Cormorant Garamond",Georgia,serif;
  --font-zine: "Special Elite","Courier New",monospace;
  --font-mono: "JetBrains Mono",ui-monospace,monospace;
  --font-body: "Cormorant Garamond",Georgia,serif;
  --font-ui: ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;
}

.ds-wm-backdrop {
  position: absolute; inset: 0;
  background: rgba(0,0,0,.72);
  backdrop-filter: blur(2px);
}

.ds-wm-panel {
  position: relative; width: 100%; max-width: 560px; margin: 0 16px;
  background: var(--paper);
  background-image:
    radial-gradient(ellipse at 20% 10%, rgba(184,156,106,.18), transparent 50%),
    radial-gradient(ellipse at 80% 80%, rgba(120,80,40,.14), transparent 55%);
  border: 1px solid var(--ink);
  box-shadow:
    0 1px 0 rgba(255,255,255,.5) inset,
    0 0 0 1px var(--paper-2) inset,
    0 14px 40px rgba(0,0,0,.5),
    0 4px 12px rgba(0,0,0,.25);
  display: flex; flex-direction: column;
  max-height: 90vh; overflow: hidden;
  font-family: var(--font-body);
}

.ds-wm-head {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 14px;
  background: var(--ink); color: var(--paper);
  box-shadow: 0 1px 0 rgba(255,255,255,.06) inset;
  flex-shrink: 0;
}

.ds-wm-glyph {
  font-family: var(--font-display); font-style: italic;
  font-size: 22px; color: var(--paper-3); flex: 0 0 auto;
}

.ds-wm-title-wrap { flex: 1; min-width: 0; }

.ds-wm-title {
  margin: 0; font-family: var(--font-display); font-style: italic;
  font-size: 18px; font-weight: 400; color: var(--paper); letter-spacing: .01em;
}

.ds-wm-subtitle {
  margin: 2px 0 0; font-family: var(--font-ui); font-size: 12px;
  color: rgba(237,225,199,.5); letter-spacing: .02em;
}

.ds-wm-close {
  background: transparent; border: 1px solid rgba(237,225,199,.18);
  color: rgba(237,225,199,.55); width: 24px; height: 24px;
  display: grid; place-items: center; border-radius: 2px;
  cursor: pointer; transition: background .12s, color .12s, border-color .12s;
  flex: 0 0 auto; font-size: 13px;
}
.ds-wm-close:hover { background: rgba(237,225,199,.12); color: var(--paper); border-color: rgba(237,225,199,.4); }

.ds-wm-body {
  overflow-y: auto; padding: 14px 16px 8px; min-height: 0;
  display: flex; flex-direction: column; gap: 10px;
}

.ds-wm-grid {
  display: grid; grid-template-columns: 1fr 1fr; gap: 8px;
}

.ds-wm-card {
  background: var(--paper-2);
  border: 1px solid var(--rule-strong);
  border-left: 3px solid var(--accent-2);
  padding: 10px 12px;
  display: flex; flex-direction: column; gap: 5px;
}

.ds-wm-card-head {
  display: flex; align-items: center; gap: 7px;
}

.ds-wm-icon {
  color: var(--accent-2); font-size: 12px; width: 14px; text-align: center; flex: 0 0 auto;
}

.ds-wm-card-title {
  font-family: var(--font-display); font-style: italic;
  font-size: 14px; color: var(--ink); font-weight: 400;
}

.ds-wm-card-body {
  margin: 0;
  font-family: var(--font-body); font-size: 13px; color: var(--ink-2); line-height: 1.45;
}

.ds-wm-note {
  display: flex; gap: 12px; align-items: flex-start;
  padding: 10px 12px;
  background: var(--paper-2);
  border: 1px solid var(--rule-strong);
  border-left: 3px solid var(--rule-strong);
}

.ds-wm-note--gold { border-left-color: var(--gold); }
.ds-wm-note--red  { border-left-color: var(--accent); }

.ds-wm-note-icon {
  font-size: 13px; margin-top: 3px; flex: 0 0 auto;
}
.ds-wm-note--gold .ds-wm-note-icon { color: var(--gold); }
.ds-wm-note--red  .ds-wm-note-icon { color: var(--accent); }

.ds-wm-note-head {
  font-family: var(--font-zine); font-size: 10px; letter-spacing: .12em;
  text-transform: uppercase; margin-bottom: 5px;
}
.ds-wm-note--gold .ds-wm-note-head { color: var(--gold); }
.ds-wm-note--red  .ds-wm-note-head { color: var(--accent); }

.ds-wm-note-body {
  margin: 0;
  font-family: var(--font-body); font-size: 13px; color: var(--ink-2); line-height: 1.45;
}
.ds-wm-note-body strong { color: var(--ink); }
.ds-wm-note--gold .ds-wm-note-body strong { color: var(--gold); }
.ds-wm-note--red  .ds-wm-note-body strong { color: var(--accent); }

.ds-wm-footer {
  padding: 12px 16px 14px;
  border-top: 1px solid var(--rule-strong);
  flex-shrink: 0;
}

.ds-wm-btn {
  width: 100%;
  font-family: var(--font-display); font-style: italic; font-size: 15px;
  background: var(--ink); color: var(--paper);
  border: 1px solid var(--ink); padding: 8px 12px;
  cursor: pointer; letter-spacing: .02em;
  transition: background .12s, border-color .12s;
}
.ds-wm-btn:hover { background: var(--accent); border-color: var(--accent); }
</style>
