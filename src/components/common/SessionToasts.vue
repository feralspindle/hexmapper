<template>
  <DiceRollToast />
  <LuckTokenToast />
  <QuestCompleteToast />
  <LootDealToast />
  <ChatToast :bottom-class="chatBottomClass" />
  <slot />
</template>

<script setup>
import DiceRollToast from '@/components/common/DiceRollToast.vue'
import LuckTokenToast from '@/components/common/LuckTokenToast.vue'
import QuestCompleteToast from '@/components/common/QuestCompleteToast.vue'
import LootDealToast from '@/components/common/LootDealToast.vue'
import ChatToast from '@/components/common/ChatToast.vue'

defineProps({
  chatBottomClass: { type: String, default: undefined },
})
</script>
