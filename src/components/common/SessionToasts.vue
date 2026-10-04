<template>
  <DiceRollToast />
  <LuckTokenToast />
  <HellDescendToast />
  <QuestCompleteToast />
  <LootDealToast />
  <ChatToast :bottom-class="chatBottomClass" />
  <slot />
</template>

<script setup>
import DiceRollToast from '@/components/common/DiceRollToast.vue'
import LuckTokenToast from '@/components/common/LuckTokenToast.vue'
import HellDescendToast from '@/components/common/HellDescendToast.vue'
import QuestCompleteToast from '@/components/common/QuestCompleteToast.vue'
import LootDealToast from '@/components/common/LootDealToast.vue'
import ChatToast from '@/components/common/ChatToast.vue'

defineProps({
  chatBottomClass: { type: String, default: undefined },
})
</script>
