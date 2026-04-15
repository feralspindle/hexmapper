import { reactive } from 'vue'

const state = reactive({
  active: false,
  type: null,
  faClass: null,
  x: 0,
  y: 0,
})

export function useItemDrag() {
  function startDrag(type, faClass, x, y) {
    state.active = true
    state.type = type
    state.faClass = faClass
    state.x = x
    state.y = y
  }

  function updatePosition(x, y) {
    state.x = x
    state.y = y
  }

  function endDrag() {
    const result = state.active ? { type: state.type, x: state.x, y: state.y } : null
    state.active = false
    state.type = null
    state.faClass = null
    return result
  }

  return { state, startDrag, updatePosition, endDrag }
}
