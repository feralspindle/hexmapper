<template>
    <Transition name="cd">
        <div
            v-if="open"
            class="fixed overflow-hidden flex flex-col ds-char-drawer"
            :style="drawerStyle"
        >
            <CharacterSheet class="flex-1 min-h-0" />
        </div>
    </Transition>
</template>

<script setup>
import { computed } from "vue";
import CharacterSheet from "./CharacterSheet.vue";
import { HEX_MAP_THEME } from "@/lib/theme.js";

const props = defineProps({
    open: { type: Boolean, default: false },
    navHeight: { type: Number, default: 44 },
    parchment: { type: Boolean, default: false },
});
defineEmits(["close"]);

const drawerStyle = computed(() => ({
    top: "var(--topbar-h)",
    right: "var(--side-panel-w)",
    width: "18rem",
    height: "calc((100vh - var(--topbar-h)) * 0.8)",
    zIndex: 10,
    ...(props.parchment ? {} : HEX_MAP_THEME),
}));
</script>

<style scoped>
.ds-char-drawer {
    background: var(--paper, #ede1c7);
    border-bottom: 1px solid var(--rule-strong, #c8baa0);
    border-left: 1px solid var(--rule-strong, #c8baa0);
    box-shadow: -4px 4px 24px rgba(0, 0, 0, 0.45);
}

.cd-enter-active {
    transition:
        transform 320ms cubic-bezier(0.32, 0.72, 0, 1),
        opacity 240ms ease-out;
}
.cd-leave-active {
    transition:
        transform 220ms cubic-bezier(0.55, 0, 1, 0.45),
        opacity 180ms ease-in;
}
.cd-enter-from,
.cd-leave-to {
    transform: translateX(100%);
    opacity: 0;
}
</style>
