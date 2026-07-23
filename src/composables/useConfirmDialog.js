import { reactive } from 'vue'

const state = reactive({
  visible:      false,
  message:      '',
  confirmLabel: 'Delete',
  tone:         'danger',
  confirmIcon:  'fa-solid fa-trash fa-xs',
  onConfirm:    null,
})

export function useConfirmDialog() {
  // tone: 'danger' (default) for destructive confirms, 'neutral' for the rest
  function confirm(message, onConfirm, options = {}) {
    state.message      = message
    state.onConfirm    = onConfirm
    state.confirmLabel = options.confirmLabel ?? 'Delete'
    state.tone         = options.tone         ?? 'danger'
    state.confirmIcon  = options.confirmIcon  ?? 'fa-solid fa-trash fa-xs'
    state.visible      = true
  }

  function accept() {
    state.onConfirm?.()
    state.visible = false
  }

  function cancel() {
    state.visible = false
  }

  return { state, confirm, accept, cancel }
}
