import { ref, onMounted, onUnmounted } from 'vue'

export function useFloatingPanel({ storagePrefix, defaultPos, defaultSize, minW = 280, maxW = 600, minH = 200 }) {
  const posKey = `${storagePrefix}.pos`
  const sizeKey = `${storagePrefix}.size`
  const pos = ref({ ...defaultPos })
  const size = ref({ ...defaultSize })

  onMounted(() => {
    try {
      const savedPos = JSON.parse(localStorage.getItem(posKey) ?? 'null')
      if (savedPos?.x !== undefined) pos.value = savedPos
      const savedSize = JSON.parse(localStorage.getItem(sizeKey) ?? 'null')
      if (savedSize?.w !== undefined) size.value = savedSize
    } catch {}
  })

  let dragStart = null
  function startDrag(e) {
    dragStart = { mx: e.clientX, my: e.clientY, px: pos.value.x, py: pos.value.y }
    window.addEventListener('mousemove', onDragMove)
    window.addEventListener('mouseup', onDragUp)
  }
  function onDragMove(e) {
    if (!dragStart) return
    pos.value = {
      x: Math.max(0, dragStart.px + (e.clientX - dragStart.mx)),
      y: Math.max(0, dragStart.py + (e.clientY - dragStart.my)),
    }
  }
  function onDragUp() {
    dragStart = null
    localStorage.setItem(posKey, JSON.stringify(pos.value))
    window.removeEventListener('mousemove', onDragMove)
    window.removeEventListener('mouseup', onDragUp)
  }

  let resizeStart = null
  function startResize(e) {
    resizeStart = { mx: e.clientX, my: e.clientY, w: size.value.w, h: size.value.h }
    window.addEventListener('mousemove', onResizeMove)
    window.addEventListener('mouseup', onResizeUp)
  }
  function onResizeMove(e) {
    if (!resizeStart) return
    size.value = {
      w: Math.max(minW, Math.min(maxW, resizeStart.w + (e.clientX - resizeStart.mx))),
      h: Math.max(minH, Math.min(window.innerHeight - 60, resizeStart.h + (e.clientY - resizeStart.my))),
    }
  }
  function onResizeUp() {
    resizeStart = null
    localStorage.setItem(sizeKey, JSON.stringify(size.value))
    window.removeEventListener('mousemove', onResizeMove)
    window.removeEventListener('mouseup', onResizeUp)
  }

  onUnmounted(() => {
    window.removeEventListener('mousemove', onDragMove)
    window.removeEventListener('mouseup', onDragUp)
    window.removeEventListener('mousemove', onResizeMove)
    window.removeEventListener('mouseup', onResizeUp)
  })

  return { pos, size, startDrag, startResize }
}
