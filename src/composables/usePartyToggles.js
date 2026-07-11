import { computed } from 'vue'
import { usePartyNotebook } from '@/composables/usePartyNotebook.js'
import { usePartyPanel } from '@/composables/usePartyPanel.js'

// the party / inventory / vault toggle trio both left toolbars wire up
export function usePartyToggles() {
  const { visible: inventoryVisible, activeTab: notebookTab, toggle: toggleInventory, open: openNotebook } = usePartyNotebook()
  const { visible: partyVisible, toggle: toggleParty } = usePartyPanel()
  const vaultVisible = computed(() => inventoryVisible.value && notebookTab.value === 'vault')
  function toggleVault() {
    if (vaultVisible.value) { toggleInventory() } else { openNotebook('vault') }
  }
  return { inventoryVisible, toggleInventory, partyVisible, toggleParty, vaultVisible, toggleVault }
}
