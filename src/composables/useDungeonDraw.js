import { ref, computed } from 'vue'

export const CELL_SIZE = 20
const POLYGON_CLOSE_THRESHOLD = 1.5

export function pixelToGrid(px, py, viewport) {
  const cs = CELL_SIZE * (viewport.zoom ?? 1)
  const gx = Math.round((px + viewport.offsetX) / cs)
  const gy = Math.round((py + viewport.offsetY) / cs)
  return { gx, gy }
}

export function pixelToCell(px, py, viewport) {
  const cs = CELL_SIZE * (viewport.zoom ?? 1)
  return {
    cellX: Math.floor((px + viewport.offsetX) / cs),
    cellY: Math.floor((py + viewport.offsetY) / cs),
  }
}

export function gridToPixel(gx, gy, viewport) {
  const cs = CELL_SIZE * (viewport.zoom ?? 1)
  const px = gx * cs - viewport.offsetX
  const py = gy * cs - viewport.offsetY
  return { px, py }
}

function pointInPolygon(px, py, points) {
  let inside = false
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const xi = points[i].x, yi = points[i].y
    const xj = points[j].x, yj = points[j].y
    if (((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi))
      inside = !inside
  }
  return inside
}

export function corridorSegments(c) {
  if (c.points?.length >= 2) {
    const segs = []
    for (let i = 0; i < c.points.length - 1; i++) {
      segs.push({ x1: c.points[i].x, y1: c.points[i].y, x2: c.points[i+1].x, y2: c.points[i+1].y })
    }
    return segs
  }
  return [{ x1: c.x1, y1: c.y1, x2: c.x2, y2: c.y2 }]
}

export function useDungeonDraw(viewport) {
  const drawState = ref('idle')
  const ghost = ref(null)

  const roomStart = ref(null)
  const corridorPoints = ref([])
  const polygonPoints = ref([])

  function onMouseDown(event, mode, canvasRect) {
    if (mode !== 'room' && mode !== 'circle') return
    const { gx, gy } = pixelToGrid(
      event.clientX - canvasRect.left,
      event.clientY - canvasRect.top,
      viewport.value,
    )

    if (mode === 'room' || mode === 'circle') {
      drawState.value = 'drawing_room'
      roomStart.value = { gx, gy }
      ghost.value = { type: mode === 'circle' ? 'circle' : 'room', x: gx, y: gy, w: 0, h: 0 }
    }
  }

  function onMouseMove(event, mode, canvasRect) {
    if (drawState.value === 'idle') return
    const { gx, gy } = pixelToGrid(
      event.clientX - canvasRect.left,
      event.clientY - canvasRect.top,
      viewport.value,
    )

    if (drawState.value === 'drawing_room' && roomStart.value) {
      const w = gx - roomStart.value.gx
      const h = gy - roomStart.value.gy
      ghost.value = {
        ...ghost.value,
        x: w >= 0 ? roomStart.value.gx : gx,
        y: h >= 0 ? roomStart.value.gy : gy,
        w: Math.abs(w),
        h: Math.abs(h),
      }
    } else if (drawState.value === 'corridor_drawing') {
      ghost.value = { ...ghost.value, mouseX: gx, mouseY: gy }
    } else if (drawState.value === 'drawing_polygon') {
      ghost.value = { ...ghost.value, mouseX: gx, mouseY: gy }
    }
  }

  function onMouseUp(event, mode, canvasRect) {
    if (drawState.value !== 'drawing_room') return null
    const { gx, gy } = pixelToGrid(
      event.clientX - canvasRect.left,
      event.clientY - canvasRect.top,
      viewport.value,
    )

    const w = gx - roomStart.value.gx
    const h = gy - roomStart.value.gy
    const shape = ghost.value?.type === 'circle' ? 'circle' : 'rect'
    const room = {
      origin_x: w >= 0 ? roomStart.value.gx : gx,
      origin_y: h >= 0 ? roomStart.value.gy : gy,
      width: Math.max(1, Math.abs(w)),
      height: Math.max(1, Math.abs(h)),
      shape,
    }

    ghost.value = null
    drawState.value = 'idle'
    roomStart.value = null
    return { type: 'room', ...room }
  }

  function onCanvasClick(event, mode, canvasRect) {
    if (mode !== 'corridor') return null
    const { gx, gy } = pixelToGrid(
      event.clientX - canvasRect.left,
      event.clientY - canvasRect.top,
      viewport.value,
    )

    if (drawState.value !== 'corridor_drawing') {
      drawState.value = 'corridor_drawing'
      corridorPoints.value = [{ gx, gy }]
      ghost.value = { type: 'corridor', points: [{ x: gx, y: gy }], mouseX: gx, mouseY: gy }
      return null
    }

    corridorPoints.value = [...corridorPoints.value, { gx, gy }]
    ghost.value = {
      ...ghost.value,
      points: corridorPoints.value.map(p => ({ x: p.gx, y: p.gy })),
      mouseX: gx,
      mouseY: gy,
    }
    return null
  }

  function commitCorridor() {
    if (drawState.value !== 'corridor_drawing' || corridorPoints.value.length < 2) return null
    const pts = corridorPoints.value.map(p => ({ x: p.gx, y: p.gy }))
    const first = pts[0], last = pts[pts.length - 1]
    ghost.value = null
    drawState.value = 'idle'
    corridorPoints.value = []
    return {
      type: 'corridor',
      points: pts,
      x1: first.x, y1: first.y,
      x2: last.x,  y2: last.y,
    }
  }

  function onPolygonClick(event, canvasRect) {
    const { gx, gy } = pixelToGrid(
      event.clientX - canvasRect.left,
      event.clientY - canvasRect.top,
      viewport.value,
    )

    if (polygonPoints.value.length >= 3) {
      const first = polygonPoints.value[0]
      if (Math.hypot(gx - first.gx, gy - first.gy) <= POLYGON_CLOSE_THRESHOLD) {
        const pts = polygonPoints.value.map(p => ({ x: p.gx, y: p.gy }))
        const xs = pts.map(p => p.x)
        const ys = pts.map(p => p.y)
        const minX = Math.min(...xs), maxX = Math.max(...xs)
        const minY = Math.min(...ys), maxY = Math.max(...ys)
        ghost.value = null
        drawState.value = 'idle'
        polygonPoints.value = []
        return {
          type: 'room',
          shape: 'polygon',
          points: pts,
          origin_x: minX,
          origin_y: minY,
          width: Math.max(1, maxX - minX),
          height: Math.max(1, maxY - minY),
        }
      }
    }

    polygonPoints.value = [...polygonPoints.value, { gx, gy }]
    drawState.value = 'drawing_polygon'
    ghost.value = {
      type: 'polygon',
      points: polygonPoints.value.map(p => ({ x: p.gx, y: p.gy })),
      mouseX: gx,
      mouseY: gy,
    }
    return null
  }

  function cancel() {
    drawState.value = 'idle'
    ghost.value = null
    roomStart.value = null
    corridorPoints.value = []
    polygonPoints.value = []
  }

  function hitTestRoom(gx, gy, rooms) {
    for (const [id, room] of rooms) {
      if (room.shape === 'circle') {
        const cx = room.origin_x + room.width / 2
        const cy = room.origin_y + room.height / 2
        const rx = room.width / 2
        const ry = room.height / 2
        if (rx > 0 && ry > 0 && ((gx - cx) / rx) ** 2 + ((gy - cy) / ry) ** 2 <= 1) return id
      } else if (room.shape === 'polygon' && room.points?.length >= 3) {
        if (pointInPolygon(gx, gy, room.points)) return id
      } else {
        if (
          gx >= room.origin_x &&
          gx <= room.origin_x + room.width &&
          gy >= room.origin_y &&
          gy <= room.origin_y + room.height
        ) return id
      }
    }
    return null
  }

  function hitTestCorridor(gx, gy, corridors, threshold = 0.8) {
    for (const [id, c] of corridors) {
      for (const seg of corridorSegments(c)) {
        if (pointToSegmentDist(gx, gy, seg.x1, seg.y1, seg.x2, seg.y2) <= threshold) return id
      }
    }
    return null
  }

  const isDrawing = computed(() => drawState.value !== 'idle')

  return {
    drawState,
    ghost,
    isDrawing,
    onMouseDown,
    onMouseMove,
    onMouseUp,
    onCanvasClick,
    commitCorridor,
    onPolygonClick,
    cancel,
    hitTestRoom,
    hitTestCorridor,
  }
}

function pointToSegmentDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax
  const dy = by - ay
  if (dx === 0 && dy === 0) return Math.hypot(px - ax, py - ay)
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}
