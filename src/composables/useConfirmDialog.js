import { reactive } from 'vue'

const state = reactive({
  visible:      false,
  message:      '',
  confirmLabel: 'Delete',
  confirmClass: 'border-red-900 text-red-300 bg-red-950 hover:bg-red-900',
  confirmIcon:  'fa-solid fa-trash fa-xs',
  onConfirm:    null,
})

export function useConfirmDialog() {
  function confirm(message, onConfirm, options = {}) {
    state.message      = message
    state.onConfirm    = onConfirm
    state.confirmLabel = options.confirmLabel ?? 'Delete'
    state.confirmClass = options.confirmClass ?? 'border-red-900 text-red-300 bg-red-950 hover:bg-red-900'
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
