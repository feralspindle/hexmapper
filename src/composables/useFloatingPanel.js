import { ref, onMounted, onUnmounted } from 'vue'

// shared z-order for every floating panel. ranks are reassigned on each
// change so panels stay inside 90..(90+n-1), below the mobile full-bleed
// override (95 !important) and live cursors (100)
const PANEL_Z_BASE = 90
const panelStack = []

function restackPanels() {
  panelStack.forEach((z, i) => { z.value = PANEL_Z_BASE + i })
}

export function usePanelStack() {
  const zIndex = ref(PANEL_Z_BASE)
  panelStack.push(zIndex)
  restackPanels()

  function bringToFront() {
    const i = panelStack.indexOf(zIndex)
    if (i === -1 || i === panelStack.length - 1) return
    panelStack.splice(i, 1)
    panelStack.push(zIndex)
    restackPanels()
  }

  onUnmounted(() => {
    const i = panelStack.indexOf(zIndex)
    if (i !== -1) panelStack.splice(i, 1)
    restackPanels()
  })

  return { zIndex, bringToFront }
}

export function useFloatingPanel({ storagePrefix, defaultPos, defaultSize, minW = 280, maxW = 600, minH = 200 }) {
  const posKey = `${storagePrefix}.pos`
  const sizeKey = `${storagePrefix}.size`
  const pos = ref({ ...defaultPos })
  const size = ref({ ...defaultSize })
  const { zIndex, bringToFront } = usePanelStack()

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

  return { pos, size, zIndex, bringToFront, startDrag, startResize }
}
