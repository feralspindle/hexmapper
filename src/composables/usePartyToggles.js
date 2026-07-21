import { computed } from 'vue'
import { usePartyNotebook } from '@/composables/usePartyNotebook.js'
import { usePartyPanel } from '@/composables/usePartyPanel.js'
import { useSoloToolkit } from '@/composables/useSoloToolkit.js'
import { useJournalPanel } from '@/composables/useJournalPanel.js'

// the panel toggles both left toolbars wire up
export function usePartyToggles() {
  const { visible: inventoryVisible, activeTab: notebookTab, toggle: toggleInventory, open: openNotebook } = usePartyNotebook()
  const { visible: partyVisible, toggle: toggleParty } = usePartyPanel()
  const { visible: toolkitVisible, toggle: toggleToolkit } = useSoloToolkit()
  const { visible: journalVisible, toggle: toggleJournal } = useJournalPanel()
  const vaultVisible = computed(() => inventoryVisible.value && notebookTab.value === 'vault')
  function toggleVault() {
    if (vaultVisible.value) { toggleInventory() } else { openNotebook('vault') }
  }
  return { partyVisible, toggleParty, vaultVisible, toggleVault, toolkitVisible, toggleToolkit, journalVisible, toggleJournal }
}
