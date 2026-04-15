import { reactive } from 'vue'

const state = reactive({
  visible: false,
  message: '',
  onConfirm: null,
})

export function useConfirmDialog() {
  function confirm(message, onConfirm) {
    state.message = message
    state.onConfirm = onConfirm
    state.visible = true
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
