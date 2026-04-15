<template>
  <div ref="containerEl" class="relative w-full h-full overflow-hidden">

    <canvas
      ref="canvasEl"
      class="absolute inset-0 cursor-crosshair"
      :style="{ cursor: cursorStyle }"
      @mousedown="onMouseDown"
      @mousemove="onMouseMove"
      @mouseup="onMouseUp"
      @click="onClick"
      @wheel.prevent="onWheel"
      @contextmenu.prevent="draw.cancel"
      @dblclick="onDoubleClick"
    />

    <svg
      class="absolute inset-0 pointer-events-none"
      :width="canvasWidth"
      :height="canvasHeight"
    >
      <defs>

        <filter id="editor-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="4" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
        <clipPath v-for="[id, room] in dungeonStore.rooms" :key="`clip-${id}`" :id="`room-clip-${id}`">
          <ellipse
            v-if="room.shape === 'circle'"
            :cx="(room.origin_x + room.width / 2) * cellPx - viewport.offsetX"
            :cy="(room.origin_y + room.height / 2) * cellPx - viewport.offsetY"
            :rx="room.width * cellPx / 2 - 1"
            :ry="room.height * cellPx / 2 - 1"
          />
          <polygon
            v-else-if="room.shape === 'polygon' && room.points?.length"
            :points="room.points.map(p => `${p.x * cellPx - viewport.offsetX},${p.y * cellPx - viewport.offsetY}`).join(' ')"
          />
          <rect
            v-else
            :x="room.origin_x * cellPx - viewport.offsetX + 1"
            :y="room.origin_y * cellPx - viewport.offsetY + 1"
            :width="room.width * cellPx - 2"
            :height="room.height * cellPx - 2"
          />
        </clipPath>
      </defs>
      <g v-for="[id, room] in dungeonStore.rooms" :key="id">
        <template v-if="true" v-bind="{}">
          <template v-for="r in [resizeGhost && id === resizeRoomId ? resizeGhost : moveGhost && id === moveRoomId ? moveGhost : room]" :key="'r'">
            <text
              v-if="room.label"
              :x="r.origin_x * cellPx - viewport.offsetX + (r.width * cellPx) / 2"
              :y="r.origin_y * cellPx - viewport.offsetY + (r.height * cellPx) / 2 + 4"
              text-anchor="middle"
              class="dungeon-label pointer-events-auto cursor-pointer"
              fill="#333"
              font-size="12"
              font-family="'Crimson Text', serif"
              @dblclick.stop="openAnnotation('room', id)"
            >{{ room.label }}</text>
            <text
              :x="r.origin_x * cellPx - viewport.offsetX + (r.width * cellPx) / 2"
              :y="r.origin_y * cellPx - viewport.offsetY + (r.height * cellPx) / 2 + (room.label ? 17 : 4)"
              text-anchor="middle"
              fill="#7a7060"
              font-size="9"
              font-family="sans-serif"
            >{{ r.width * 5 }} × {{ r.height * 5 }} ft</text>
            <g :clip-path="`url(#room-clip-${id})`">
              <foreignObject
                v-for="item in (room.items ?? [])"
                :key="item.id"
                :x="Math.max(r.origin_x * cellPx - viewport.offsetX, Math.min((r.origin_x + r.width) * cellPx - viewport.offsetX - editorAvatarSize, (draggingItem?.itemId === item.id ? draggingItem.ghostX : item.x) * cellPx - viewport.offsetX - editorAvatarSize / 2))"
                :y="Math.max(r.origin_y * cellPx - viewport.offsetY, Math.min((r.origin_y + r.height) * cellPx - viewport.offsetY - editorAvatarSize, (draggingItem?.itemId === item.id ? draggingItem.ghostY : item.y) * cellPx - viewport.offsetY - editorAvatarSize / 2))"
                :width="editorAvatarSize"
                :height="editorAvatarSize"
                class="pointer-events-auto"
                :style="{ cursor: 'grab' }"
                @mousedown.stop="onItemMouseDown($event, id, item)"
              >
                <i
                  xmlns="http://www.w3.org/1999/xhtml"
                  :class="faClassForType(item.type)"
                  :style="{ fontSize: Math.max(10, Math.round(editorAvatarSize * 0.65)) + 'px', color: '#000000', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%', pointerEvents: 'none' }"
                />
              </foreignObject>
            </g>
          </template>
        </template>
      </g>

      <text
        v-if="(draw.ghost.value?.type === 'room' || draw.ghost.value?.type === 'circle') && draw.ghost.value.w > 0 && draw.ghost.value.h > 0"
        :x="draw.ghost.value.x * cellPx - viewport.offsetX + (draw.ghost.value.w * cellPx) / 2"
        :y="draw.ghost.value.y * cellPx - viewport.offsetY + (draw.ghost.value.h * cellPx) / 2 + 4"
        text-anchor="middle"
        fill="#a09080"
        font-size="10"
        font-family="sans-serif"
      >
        {{ draw.ghost.value.w * 5 }} × {{ draw.ghost.value.h * 5 }} ft
      </text>

      <g v-for="[id, corridor] in dungeonStore.corridors" :key="id">
        <text
          v-if="corridor.label"
          :x="((corridor.x1 + corridor.x2) / 2) * cellPx - viewport.offsetX"
          :y="((corridor.y1 + corridor.y2) / 2) * cellPx - viewport.offsetY - 4"
          text-anchor="middle"
          fill="#b0a898"
          font-size="9"
          font-family="'Crimson Text', serif"
        >
          {{ corridor.label }}
        </text>
      </g>


      <g v-for="[roomId, editors] in editingViewers" :key="`editors-${roomId}`">
        <template v-for="r in [dungeonStore.rooms.get(roomId)]" :key="'eg'">
          <template v-if="r">
        
            <ellipse
              v-if="r.shape === 'circle'"
              :cx="(r.origin_x + r.width / 2) * cellPx - viewport.offsetX"
              :cy="(r.origin_y + r.height / 2) * cellPx - viewport.offsetY"
              :rx="r.width * cellPx / 2 + 2"
              :ry="r.height * cellPx / 2 + 2"
              fill="none"
              stroke="#94a3b8"
              stroke-width="2"
              filter="url(#editor-glow)"
              opacity="0.7"
            />
            <polygon
              v-else-if="r.shape === 'polygon' && r.points?.length"
              :points="r.points.map(p => `${p.x * cellPx - viewport.offsetX},${p.y * cellPx - viewport.offsetY}`).join(' ')"
              fill="none"
              stroke="#94a3b8"
              stroke-width="2"
              filter="url(#editor-glow)"
              opacity="0.7"
            />
            <rect
              v-else
              :x="r.origin_x * cellPx - viewport.offsetX - 2"
              :y="r.origin_y * cellPx - viewport.offsetY - 2"
              :width="r.width * cellPx + 4"
              :height="r.height * cellPx + 4"
              rx="2"
              fill="none"
              stroke="#94a3b8"
              stroke-width="2"
              filter="url(#editor-glow)"
              opacity="0.7"
            />


            <foreignObject
              v-for="(editor, i) in editors"
              :key="editor.user_id"
              :x="roomTopRight(r).x - editorAvatarSize / 2 - i * editorAvatarSize * 0.8"
              :y="roomTopRight(r).y - editorAvatarSize / 2"
              :width="editorAvatarSize"
              :height="editorAvatarSize"
              overflow="visible"
              style="pointer-events: auto; overflow: visible;"
            >
              <div
                xmlns="http://www.w3.org/1999/xhtml"
                class="group relative"
                :style="{ width: editorAvatarSize + 'px', height: editorAvatarSize + 'px' }"
              >
                <div
                  :style="{ width: editorAvatarSize + 'px', height: editorAvatarSize + 'px', borderRadius: '50%', overflow: 'hidden', border: '2px solid #1c1917', boxShadow: '0 0 4px rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: Math.max(9, editorAvatarSize * 0.4) + 'px', fontWeight: 'bold', color: '#fff', background: editor.avatar_url ? 'transparent' : editorColor(editor.user_id) }"
                >
                  <img
                    v-if="editor.avatar_url"
                    :src="editor.avatar_url"
                    style="width:100%;height:100%;object-fit:cover;"
                  />
                  <span v-else>{{ editor.display_name?.charAt(0)?.toUpperCase() }}</span>
                </div>
                <div
                  class="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-1 rounded text-xs whitespace-nowrap pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity"
                  style="background:#1c1917;border:1px solid #44403c;color:#e7e5e4;z-index:50;"
                >
                  {{ editor.display_name }}
                </div>
              </div>
            </foreignObject>
          </template>
        </template>
      </g>
    </svg>

    <div class="absolute bottom-4 left-4 flex items-end gap-4 pointer-events-none select-none">

      <div class="flex flex-col items-start gap-1">
        <div class="flex items-center">
          <div class="border-l border-t border-b border-stone-400" style="width: 1px; height: 6px" />
          <div class="border-t border-stone-400" :style="{ width: `${cellPx * 2}px` }" />
          <div class="border-r border-t border-b border-stone-400" style="width: 1px; height: 6px" />
        </div>
        <span class="text-stone-400" style="font-size: 10px">10 ft</span>
      </div>

  
      <div class="flex flex-col items-center" style="width: 44px; height: 44px; position: relative;">
        <svg width="44" height="44" viewBox="0 0 44 44">
        
          <circle cx="22" cy="22" r="20" fill="none" stroke="#57534e" stroke-width="1" />
        
          <polygon points="22,4 19,22 22,20 25,22" fill="#c8a86b" />
          <polygon points="22,40 19,22 22,24 25,22" fill="#57534e" />
          <text x="22" y="3" text-anchor="middle" fill="#c8a86b" font-size="7" font-family="sans-serif" font-weight="bold">N</text>
          <text x="22" y="43" text-anchor="middle" fill="#78716c" font-size="6" font-family="sans-serif">S</text>
          <text x="42" y="23" text-anchor="middle" fill="#78716c" font-size="6" font-family="sans-serif">E</text>
          <text x="2" y="23" text-anchor="middle" fill="#78716c" font-size="6" font-family="sans-serif">W</text>
        </svg>
      </div>
    </div>

  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useD } from '@/stores/dungeonStore.js'
import { useAuthStore } from '@/stores/authStore.js'
import { useDungeonDraw, CELL_SIZE, pixelToGrid } from '@/composables/useDungeonDraw.js'
import { useConfirmDialog } from '@/composables/useConfirmDialog.js'
import { faClassForType } from '@/lib/roomItems.js'

const FLOOR = '#ffffff'
const WALL  = '#000000'
const ROCK  = '#000000'

const props = defineProps({ dungeonId: String })

const dungeonStore = useD()
const authStore = useAuthStore()
const { confirm } = useConfirmDialog()


const editingViewers = computed(() => {
  const map = new Map()
  for (const viewer of dungeonStore.viewers) {
    if (!viewer.editing_id || viewer.editing_type !== 'room') continue
    if (viewer.user_id === authStore.user?.id) continue
    if (!dungeonStore.rooms.has(viewer.editing_id)) continue
    const list = map.get(viewer.editing_id) ?? []
    list.push(viewer)
    map.set(viewer.editing_id, list)
  }
  return map
})

const editorAvatarSize = computed(() => Math.max(16, Math.min(36, Math.round(cellPx.value))))

const EDITOR_COLORS = ['#4f46e5', '#7c3aed', '#be185d', '#b45309', '#0f766e', '#0369a1', '#15803d', '#db2777']
function editorColor(userId) {
  const hash = (userId ?? '').split('').reduce((acc, c) => acc + c.charCodeAt(0), 0)
  return EDITOR_COLORS[hash % EDITOR_COLORS.length]
}

function roomTopRight(room) {
  const cs = cellPx.value
  if (room.shape === 'circle') {
    return {
      x: (room.origin_x + room.width) * cs - viewport.value.offsetX,
      y: room.origin_y * cs - viewport.value.offsetY,
    }
  }
  if (room.shape === 'polygon' && room.points?.length) {

    let best = room.points[0]
    for (const p of room.points) {
      if (p.x > best.x || (p.x === best.x && p.y < best.y)) best = p
    }
    return { x: best.x * cs - viewport.value.offsetX, y: best.y * cs - viewport.value.offsetY }
  }
  return {
    x: (room.origin_x + room.width) * cs - viewport.value.offsetX,
    y: room.origin_y * cs - viewport.value.offsetY,
  }
}

const containerEl = ref(null)
const canvasEl = ref(null)
const canvasWidth = ref(800)
const canvasHeight = ref(600)
let ctx = null
let rafId = null


const viewport = ref({ offsetX: -100, offsetY: -100, zoom: 1 })
const cellPx = computed(() => CELL_SIZE * viewport.value.zoom)

function applyZoom(factor, mx, my) {
  const oldZoom = viewport.value.zoom
  const newZoom = Math.max(0.25, Math.min(4, oldZoom * factor))
  const ratio = newZoom / oldZoom
  viewport.value = {
    offsetX: mx * (ratio - 1) + viewport.value.offsetX * ratio,
    offsetY: my * (ratio - 1) + viewport.value.offsetY * ratio,
    zoom: newZoom,
  }
}

function zoomIn()    { applyZoom(1.25,       canvasWidth.value / 2, canvasHeight.value / 2) }
function zoomOut()   { applyZoom(1 / 1.25,  canvasWidth.value / 2, canvasHeight.value / 2) }
function resetZoom() { viewport.value = { ...viewport.value, zoom: 1 } }

function findFreeSlot(room, desiredX, desiredY, existingItems, step) {
  const m = step * 0.5
  const minX = room.origin_x + m
  const maxX = room.origin_x + room.width  - m
  const minY = room.origin_y + m
  const maxY = room.origin_y + room.height - m

  const candidates = []
  for (let gy = minY; gy <= maxY + 0.001; gy += step) {
    for (let gx = minX; gx <= maxX + 0.001; gx += step) {
      candidates.push({ x: gx, y: gy })
    }
  }

  candidates.sort((a, b) =>
    Math.hypot(a.x - desiredX, a.y - desiredY) - Math.hypot(b.x - desiredX, b.y - desiredY)
  )

  for (const pos of candidates) {
    if (!existingItems.some(item => Math.hypot(item.x - pos.x, item.y - pos.y) < step * 0.9)) {
      return pos
    }
  }
  return { x: desiredX, y: desiredY }
}

function dropItem(type, clientX, clientY) {
  const rect = getRect()
  const mx = clientX - rect.left
  const my = clientY - rect.top
  const { gx, gy } = pixelToGrid(mx, my, viewport.value)

  let roomId = draw.hitTestRoom(gx, gy, dungeonStore.rooms)
  let x = gx
  let y = gy

  if (!roomId) {
    let minDist = Infinity
    for (const [id, room] of dungeonStore.rooms) {
      const cx = room.origin_x + room.width / 2
      const cy = room.origin_y + room.height / 2
      const dist = Math.hypot(gx - cx, gy - cy)
      if (dist < minDist) { minDist = dist; roomId = id }
    }
    if (roomId) {
      const room = dungeonStore.rooms.get(roomId)
      const m = (editorAvatarSize.value / 2) / cellPx.value
      x = Math.max(room.origin_x + m, Math.min(room.origin_x + room.width  - m, gx))
      y = Math.max(room.origin_y + m, Math.min(room.origin_y + room.height - m, gy))
    }
  }

  if (roomId) {
    const room = dungeonStore.rooms.get(roomId)
    const step = editorAvatarSize.value / cellPx.value
    const free = findFreeSlot(room, x, y, room.items ?? [], step)
    dungeonStore.addRoomItem(roomId, type, free.x, free.y)
  }
}

function addToSelectedRoom(type) {
  const sel = dungeonStore.selectedElement
  if (sel?.type !== 'room') return
  const room = dungeonStore.rooms.get(sel.id)
  if (!room) return
  const cx = room.origin_x + room.width / 2
  const cy = room.origin_y + room.height / 2
  const step = editorAvatarSize.value / cellPx.value
  const free = findFreeSlot(room, cx, cy, room.items ?? [], step)
  dungeonStore.addRoomItem(sel.id, type, free.x, free.y)
}

defineExpose({ zoomIn, zoomOut, resetZoom, dropItem, addToSelectedRoom })

let isPanning = false
let panStart = { x: 0, y: 0 }
let panOrigin = { x: 0, y: 0 }

const draw = useDungeonDraw(viewport)
const HANDLE_HIT = 7
const HANDLE_DRAW = 5

const resizeGhost = ref(null)
const hoveredHandle = ref(null)
let isResizing = false
let resizeHandle = null
let resizeRoomId = null
let resizeStartGrid = null
let resizeOriginal = null
let didResize = false

const moveGhost = ref(null)
let isMoving = false
let moveRoomId = null
let moveStartGrid = null
let moveOriginal = null
let didMove = false

const draggingItem = ref(null) // { roomId, itemId, ghostX, ghostY }

function onItemMouseDown(_e, roomId, item) {
  draggingItem.value = { roomId, itemId: item.id, ghostX: item.x, ghostY: item.y }
  window.addEventListener('mousemove', onItemMouseMove)
  window.addEventListener('mouseup', onItemMouseUp)
}

function onItemMouseMove(e) {
  if (!draggingItem.value) return
  const rect = getRect()
  const { gx, gy } = pixelToGrid(e.clientX - rect.left, e.clientY - rect.top, viewport.value)
  draggingItem.value = { ...draggingItem.value, ghostX: gx, ghostY: gy }
}

function onItemMouseUp(_e) {
  if (!draggingItem.value) return
  const { roomId, itemId, ghostX, ghostY } = draggingItem.value
  const room = dungeonStore.rooms.get(roomId)

  const m = (editorAvatarSize.value / 2) / cellPx.value
  const x = Math.max(room.origin_x + m, Math.min(room.origin_x + room.width  - m, ghostX))
  const y = Math.max(room.origin_y + m, Math.min(room.origin_y + room.height - m, ghostY))
  dungeonStore.updateRoomItem(roomId, itemId, { x, y })

  draggingItem.value = null
  window.removeEventListener('mousemove', onItemMouseMove)
  window.removeEventListener('mouseup', onItemMouseUp)
}

const HANDLE_CURSORS = {
  nw: 'nw-resize', n: 'n-resize', ne: 'ne-resize',
  e: 'e-resize', se: 'se-resize', s: 's-resize',
  sw: 'sw-resize', w: 'w-resize',
}


function getRoomHandles(room) {
  const cs = cellPx.value
  const px = room.origin_x * cs - viewport.value.offsetX
  const py = room.origin_y * cs - viewport.value.offsetY
  const pw = room.width * cs
  const ph = room.height * cs
  return {
    nw: { x: px,        y: py        },
    n:  { x: px + pw/2, y: py        },
    ne: { x: px + pw,   y: py        },
    e:  { x: px + pw,   y: py + ph/2 },
    se: { x: px + pw,   y: py + ph   },
    s:  { x: px + pw/2, y: py + ph   },
    sw: { x: px,        y: py + ph   },
    w:  { x: px,        y: py + ph/2 },
  }
}

function hitTestHandle(mx, my, room) {
  const handles = getRoomHandles(room)
  for (const [name, pos] of Object.entries(handles)) {
    if (Math.abs(mx - pos.x) <= HANDLE_HIT && Math.abs(my - pos.y) <= HANDLE_HIT) return name
  }
  return null
}

function applyResize(handle, original, startGx, startGy, gx, gy) {
  const dx = gx - startGx
  const dy = gy - startGy
  let { origin_x, origin_y, width, height } = original

  if (handle.includes('e')) width  = Math.max(1, original.width  + dx)
  if (handle.includes('s')) height = Math.max(1, original.height + dy)
  if (handle.includes('w')) {
    const newW = Math.max(1, original.width - dx)
    origin_x = original.origin_x + (original.width - newW)
    width = newW
  }
  if (handle.includes('n')) {
    const newH = Math.max(1, original.height - dy)
    origin_y = original.origin_y + (original.height - newH)
    height = newH
  }

  return { origin_x, origin_y, width, height }
}

const cursorStyle = computed(() => {
  if (dungeonStore.drawMode === 'pan') return isPanning ? 'grabbing' : 'grab'
  if (dungeonStore.drawMode === 'edit') {
    if (isMoving) return 'grabbing'
    if (hoveredHandle.value) return HANDLE_CURSORS[hoveredHandle.value]
    if (dungeonStore.selectedElement?.type === 'room') return 'grab'
    return 'default'
  }
  if (dungeonStore.drawMode === 'select') return 'default'
  if (dungeonStore.drawMode === 'room' || dungeonStore.drawMode === 'circle' || dungeonStore.drawMode === 'polygon') return 'crosshair'
  if (dungeonStore.drawMode === 'corridor') return 'cell'
  if (dungeonStore.drawMode === 'door') return 'crosshair'
  return 'default'
})

const DOOR_HIT = 10

function roomPixelBounds(room) {
  const cs = cellPx.value
  return {
    rx: room.origin_x * cs - viewport.value.offsetX,
    ry: room.origin_y * cs - viewport.value.offsetY,
    rw: room.width  * cs,
    rh: room.height * cs,
  }
}

function doorPixelPos(door, room) {
  if (door.x !== undefined) {
    const cs = cellPx.value
    return [door.x * cs - viewport.value.offsetX, door.y * cs - viewport.value.offsetY]
  }
  const { rx, ry, rw, rh } = roomPixelBounds(room)
  return door.wall === 'n' ? [rx + door.offset * rw, ry] :
         door.wall === 's' ? [rx + door.offset * rw, ry + rh] :
         door.wall === 'w' ? [rx, ry + door.offset * rh] :
                             [rx + rw, ry + door.offset * rh]
}

function closestPointOnEllipse(mx, my, room) {
  const cs = cellPx.value
  const cx = (room.origin_x + room.width / 2) * cs - viewport.value.offsetX
  const cy = (room.origin_y + room.height / 2) * cs - viewport.value.offsetY
  const rx = room.width  * cs / 2
  const ry = room.height * cs / 2
  const angle = Math.atan2((my - cy) / ry, (mx - cx) / rx)
  const px = cx + rx * Math.cos(angle)
  const py = cy + ry * Math.sin(angle)
  return { gx: px / cs + viewport.value.offsetX / cs, gy: py / cs + viewport.value.offsetY / cs, px, py }
}

function closestPointOnPolygon(mx, my, points) {
  const cs = cellPx.value
  let bestDist = Infinity, bestPx = 0, bestPy = 0
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length]
    const ax = a.x * cs - viewport.value.offsetX, ay = a.y * cs - viewport.value.offsetY
    const bx = b.x * cs - viewport.value.offsetX, by = b.y * cs - viewport.value.offsetY
    const dx = bx - ax, dy = by - ay
    const lenSq = dx * dx + dy * dy
    const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((mx - ax) * dx + (my - ay) * dy) / lenSq))
    const nearX = ax + t * dx, nearY = ay + t * dy
    const dist = Math.hypot(mx - nearX, my - nearY)
    if (dist < bestDist) { bestDist = dist; bestPx = nearX; bestPy = nearY }
  }
  return { gx: (bestPx + viewport.value.offsetX) / cs, gy: (bestPy + viewport.value.offsetY) / cs, px: bestPx, py: bestPy, dist: bestDist }
}

function findRoomWall(mx, my) {
  const threshold = DOOR_HIT
  for (const [id, room] of dungeonStore.rooms) {
    if (room.shape === 'rect') {
      const { rx, ry, rw, rh } = roomPixelBounds(room)
      if (Math.abs(my - ry) < threshold && mx > rx && mx < rx + rw)
        return { roomId: id, wall: 'n', offset: (mx - rx) / rw }
      if (Math.abs(my - (ry + rh)) < threshold && mx > rx && mx < rx + rw)
        return { roomId: id, wall: 's', offset: (mx - rx) / rw }
      if (Math.abs(mx - rx) < threshold && my > ry && my < ry + rh)
        return { roomId: id, wall: 'w', offset: (my - ry) / rh }
      if (Math.abs(mx - (rx + rw)) < threshold && my > ry && my < ry + rh)
        return { roomId: id, wall: 'e', offset: (my - ry) / rh }
    } else if (room.shape === 'circle') {
      const { gx, gy, px, py } = closestPointOnEllipse(mx, my, room)
      if (Math.hypot(mx - px, my - py) < threshold)
        return { roomId: id, x: gx, y: gy }
    } else if (room.shape === 'polygon' && room.points?.length >= 3) {
      const { gx, gy, dist } = closestPointOnPolygon(mx, my, room.points)
      if (dist < threshold)
        return { roomId: id, x: gx, y: gy }
    }
  }
  return null
}

function findDoorAtClick(mx, my) {
  for (const [roomId, room] of dungeonStore.rooms) {
    for (const door of (room.doors ?? [])) {
      const [dx, dy] = doorPixelPos(door, room)
      if (Math.hypot(mx - dx, my - dy) < DOOR_HIT)
        return { roomId, doorId: door.id }
    }
  }
  return null
}


function renderFrame() {
  if (!ctx) return
  const W = canvasWidth.value
  const H = canvasHeight.value
  ctx.clearRect(0, 0, W, H)

  drawBackground(W, H)
  drawGrid(W, H)
  drawCorridors()
  drawRooms()
  drawDoors()
  if (draw.ghost.value) drawGhost()

  rafId = requestAnimationFrame(renderFrame)
}

function drawBackground(W, H) {
  ctx.fillStyle = ROCK
  ctx.fillRect(0, 0, W, H)
}

function drawGrid(W, H) {
  const cs = cellPx.value
  ctx.strokeStyle = '#333333'
  ctx.lineWidth = 0.5
  const startX = -(viewport.value.offsetX % cs)
  const startY = -(viewport.value.offsetY % cs)
  ctx.beginPath()
  for (let x = startX; x < W; x += cs) {
    ctx.moveTo(x, 0)
    ctx.lineTo(x, H)
  }
  for (let y = startY; y < H; y += cs) {
    ctx.moveTo(0, y)
    ctx.lineTo(W, y)
  }
  ctx.stroke()
}

function drawRooms() {
  const cs = cellPx.value
  for (const [id, room] of dungeonStore.rooms) {
    const isSelected = dungeonStore.selectedElement?.id === id
    const r = (isResizing && id === resizeRoomId && resizeGhost.value) ? resizeGhost.value
            : (isMoving   && id === moveRoomId   && moveGhost.value)   ? moveGhost.value
            : room

    const px = r.origin_x * cs - viewport.value.offsetX
    const py = r.origin_y * cs - viewport.value.offsetY
    const pw = r.width * cs
    const ph = r.height * cs
    const isCircle  = room.shape === 'circle'
    const isPolygon = room.shape === 'polygon'
    const floorColor = room.color ?? FLOOR

    const shapePath = () => {
      ctx.beginPath()
      if (isCircle) {
        ctx.ellipse(px + pw / 2, py + ph / 2, pw / 2, ph / 2, 0, 0, Math.PI * 2)
      } else if (isPolygon && r.points?.length >= 3) {
        r.points.forEach((p, i) => {
          const ppx = p.x * cs - viewport.value.offsetX
          const ppy = p.y * cs - viewport.value.offsetY
          if (i === 0) ctx.moveTo(ppx, ppy)
          else ctx.lineTo(ppx, ppy)
        })
        ctx.closePath()
      } else {
        ctx.rect(px, py, pw, ph)
      }
    }

    ctx.save()
    shapePath()
    ctx.clip()

    ctx.fillStyle = floorColor
    ctx.fill()
    ctx.strokeStyle = 'rgba(0,0,0,0.22)'
    ctx.lineWidth = Math.max(6, cs * 0.38)
    shapePath()
    ctx.stroke()

    ctx.strokeStyle = 'rgba(0,0,0,0.15)'
    ctx.lineWidth = 0.5
    ctx.beginPath()
    for (let x = px; x <= px + pw + 0.5; x += cs) {
      ctx.moveTo(x, py); ctx.lineTo(x, py + ph)
    }
    for (let y = py; y <= py + ph + 0.5; y += cs) {
      ctx.moveTo(px, y); ctx.lineTo(px + pw, y)
    }
    ctx.stroke()

    ctx.restore()

    ctx.strokeStyle = isSelected ? '#f5d76e' : '#0e0b07'
    ctx.lineWidth = isSelected ? 2.5 : 2.5
    shapePath()
    ctx.stroke()

    if (!isSelected) {
      ctx.strokeStyle = 'rgba(170, 148, 100, 0.38)'
      ctx.lineWidth = 1
      shapePath()
      ctx.stroke()
    }

    if (isSelected && dungeonStore.drawMode === 'edit' && !isPolygon) drawResizeHandles(r)
  }
}

function drawResizeHandles(room) {
  const handles = getRoomHandles(room)
  for (const pos of Object.values(handles)) {
    ctx.fillStyle = '#f5d76e'
    ctx.strokeStyle = '#1a1820'
    ctx.lineWidth = 1
    ctx.fillRect(pos.x - HANDLE_DRAW, pos.y - HANDLE_DRAW, HANDLE_DRAW * 2, HANDLE_DRAW * 2)
    ctx.strokeRect(pos.x - HANDLE_DRAW, pos.y - HANDLE_DRAW, HANDLE_DRAW * 2, HANDLE_DRAW * 2)
  }
}

function drawDoorAt(cx, cy, normalX, normalY, floorColor) {
  const opening = Math.min(cellPx.value * 0.7, 18)
  const post = 5
  const tx = -normalY, ty = normalX

  ctx.fillStyle = floorColor
  ctx.fillRect(cx - (tx * opening / 2) - normalX * 2, cy - (ty * opening / 2) - normalY * 2,
               tx * opening + normalX * 4, ty * opening + normalY * 4)

  ctx.strokeStyle = '#c8a86b'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(cx + tx * opening / 2 - normalX * post, cy + ty * opening / 2 - normalY * post)
  ctx.lineTo(cx + tx * opening / 2 + normalX * post, cy + ty * opening / 2 + normalY * post)
  ctx.moveTo(cx - tx * opening / 2 - normalX * post, cy - ty * opening / 2 - normalY * post)
  ctx.lineTo(cx - tx * opening / 2 + normalX * post, cy - ty * opening / 2 + normalY * post)
  ctx.stroke()
}

function drawDoors() {
  const cs = cellPx.value
  for (const [, room] of dungeonStore.rooms) {
    if (!room.doors?.length) continue
    const floorColor = room.color ?? FLOOR

    for (const door of room.doors) {
      const [cx, cy] = doorPixelPos(door, room)

      if (door.wall !== undefined) {
        const horiz = door.wall === 'n' || door.wall === 's'
        const nx = horiz ? 0 : (door.wall === 'w' ? -1 : 1)
        const ny = horiz ? (door.wall === 'n' ? -1 : 1) : 0
        drawDoorAt(cx, cy, nx, ny, floorColor)
      } else if (door.x !== undefined) {
        let nx = 0, ny = -1
        if (room.shape === 'circle') {
          const ecx = (room.origin_x + room.width / 2) * cs - viewport.value.offsetX
          const ecy = (room.origin_y + room.height / 2) * cs - viewport.value.offsetY
          const len = Math.hypot(cx - ecx, cy - ecy) || 1
          nx = (cx - ecx) / len; ny = (cy - ecy) / len
        } else if (room.shape === 'polygon' && room.points?.length >= 3) {
          let bestDist = Infinity, bestNx = 0, bestNy = -1
          const pts = room.points
          for (let i = 0; i < pts.length; i++) {
            const a = pts[i], b = pts[(i + 1) % pts.length]
            const ax = a.x * cs - viewport.value.offsetX, ay = a.y * cs - viewport.value.offsetY
            const bx = b.x * cs - viewport.value.offsetX, by = b.y * cs - viewport.value.offsetY
            const dx = bx - ax, dy = by - ay
            const lenSq = dx * dx + dy * dy
            const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((cx - ax) * dx + (cy - ay) * dy) / lenSq))
            const dist = Math.hypot(cx - (ax + t * dx), cy - (ay + t * dy))
            if (dist < bestDist) {
              bestDist = dist
              const segLen = Math.sqrt(lenSq) || 1
              bestNx = -dy / segLen; bestNy = dx / segLen
            }
          }
          nx = bestNx; ny = bestNy
        }
        drawDoorAt(cx, cy, nx, ny, floorColor)
      }
    }
  }
}

function drawCorridors() {
  const cs = cellPx.value
  for (const [id, c] of dungeonStore.corridors) {
    const x1 = c.x1 * cs - viewport.value.offsetX
    const y1 = c.y1 * cs - viewport.value.offsetY
    const x2 = c.x2 * cs - viewport.value.offsetX
    const y2 = c.y2 * cs - viewport.value.offsetY
    const isSelected = dungeonStore.selectedElement?.id === id
    const cw = (c.width ?? 1) * cs

    ctx.lineCap = 'square'

    ctx.strokeStyle = isSelected ? '#f5d76e' : WALL
    ctx.lineWidth = cw + 4
    ctx.beginPath()
    ctx.moveTo(x1, y1); ctx.lineTo(x2, y2)
    ctx.stroke()

    ctx.strokeStyle = FLOOR
    ctx.lineWidth = cw
    ctx.beginPath()
    ctx.moveTo(x1, y1); ctx.lineTo(x2, y2)
    ctx.stroke()

    if (isSelected) {
      ctx.strokeStyle = 'rgba(245,215,110,0.35)'
      ctx.lineWidth = cw
      ctx.beginPath()
      ctx.moveTo(x1, y1); ctx.lineTo(x2, y2)
      ctx.stroke()
    }
  }
}

function drawGhost() {
  const g = draw.ghost.value
  const cs = cellPx.value
  ctx.globalAlpha = 0.5
  if (g.type === 'room' || g.type === 'circle') {
    const px = g.x * cs - viewport.value.offsetX
    const py = g.y * cs - viewport.value.offsetY
    const pw = g.w * cs
    const ph = g.h * cs
    ctx.fillStyle = FLOOR
    ctx.strokeStyle = WALL
    ctx.lineWidth = 2
    ctx.setLineDash([4, 4])
    ctx.beginPath()
    if (g.type === 'circle') {
      ctx.ellipse(px + pw / 2, py + ph / 2, pw / 2, ph / 2, 0, 0, Math.PI * 2)
    } else {
      ctx.rect(px, py, pw, ph)
    }
    ctx.fill()
    ctx.stroke()
    ctx.setLineDash([])
  } else if (g.type === 'polygon') {
    ctx.globalAlpha = 1
    const pts = g.points
    if (!pts.length) { ctx.globalAlpha = 1; return }

    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.beginPath()
    pts.forEach((p, i) => {
      const ppx = p.x * cs - viewport.value.offsetX
      const ppy = p.y * cs - viewport.value.offsetY
      if (i === 0) ctx.moveTo(ppx, ppy)
      else ctx.lineTo(ppx, ppy)
    })
    ctx.stroke()

    if (g.mouseX !== undefined) {
      const last = pts[pts.length - 1]
      ctx.strokeStyle = '#aaaaaa'
      ctx.lineWidth = 1.5
      ctx.setLineDash([4, 4])
      ctx.beginPath()
      ctx.moveTo(last.x * cs - viewport.value.offsetX, last.y * cs - viewport.value.offsetY)
      ctx.lineTo(g.mouseX * cs - viewport.value.offsetX, g.mouseY * cs - viewport.value.offsetY)
      ctx.stroke()
      ctx.setLineDash([])
    }

    pts.forEach((p, i) => {
      const ppx = p.x * cs - viewport.value.offsetX
      const ppy = p.y * cs - viewport.value.offsetY
      ctx.fillStyle = '#ffffff'
      ctx.beginPath()
      ctx.arc(ppx, ppy, i === 0 ? 5 : 3, 0, Math.PI * 2)
      ctx.fill()
    })

    if (pts.length >= 3) {
      const first = pts[0]
      ctx.strokeStyle = '#f5d76e'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(first.x * cs - viewport.value.offsetX, first.y * cs - viewport.value.offsetY, 8, 0, Math.PI * 2)
      ctx.stroke()
    }
  } else if (g.type === 'corridor') {
    const x1 = g.x1 * cs - viewport.value.offsetX
    const y1 = g.y1 * cs - viewport.value.offsetY
    const x2 = g.x2 * cs - viewport.value.offsetX
    const y2 = g.y2 * cs - viewport.value.offsetY
    ctx.strokeStyle = '#c8a86b'
    ctx.lineWidth = 2
    ctx.setLineDash([4, 4])
    ctx.beginPath()
    ctx.moveTo(x1, y1)
    ctx.lineTo(x2, y2)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = '#f5d76e'
    ctx.beginPath()
    ctx.arc(x1, y1, 4, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalAlpha = 1
}


function getRect() {
  return canvasEl.value.getBoundingClientRect()
}

function onMouseDown(e) {
  if (e.button === 1 || (e.button === 0 && e.altKey) || (e.button === 0 && dungeonStore.drawMode === 'pan')) {
    isPanning = true
    panStart = { x: e.clientX, y: e.clientY }
    panOrigin = { ...viewport.value }
    return
  }

  if (e.button === 0 && dungeonStore.drawMode === 'edit' && dungeonStore.selectedElement?.type === 'room') {
    const room = dungeonStore.rooms.get(dungeonStore.selectedElement.id)
    if (room) {
      const rect = getRect()
      const mx = e.clientX - rect.left
      const my = e.clientY - rect.top
      const handle = room.shape === 'polygon' ? null : hitTestHandle(mx, my, room)
      if (handle) {
        isResizing = true
        didResize = false
        resizeHandle = handle
        resizeRoomId = dungeonStore.selectedElement.id
        resizeOriginal = { ...room }
        resizeGhost.value = { ...room }
        const { gx, gy } = pixelToGrid(mx, my, viewport.value)
        resizeStartGrid = { gx, gy }
        dungeonStore.beginRoomEdit(resizeRoomId, ['origin_x', 'origin_y', 'width', 'height'])
        return
      }
      const { gx, gy } = pixelToGrid(mx, my, viewport.value)
      const hitId = draw.hitTestRoom(gx, gy, dungeonStore.rooms)
      if (hitId === dungeonStore.selectedElement.id) {
        isMoving = true
        didMove = false
        moveRoomId = hitId
        moveOriginal = { ...room }
        moveGhost.value = { ...room }
        moveStartGrid = { gx, gy }
        dungeonStore.beginRoomEdit(moveRoomId, ['origin_x', 'origin_y', 'points'])
        return
      }
    }
  }

  if (dungeonStore.drawMode === 'room' || dungeonStore.drawMode === 'circle') {
    draw.onMouseDown(e, dungeonStore.drawMode, getRect())
  }
}

function onMouseMove(e) {
  if (isPanning) {
    viewport.value = {
      offsetX: panOrigin.offsetX - (e.clientX - panStart.x),
      offsetY: panOrigin.offsetY - (e.clientY - panStart.y),
      zoom: panOrigin.zoom,
    }
    return
  }

  if (isResizing) {
    const rect = getRect()
    const { gx, gy } = pixelToGrid(e.clientX - rect.left, e.clientY - rect.top, viewport.value)
    resizeGhost.value = applyResize(resizeHandle, resizeOriginal, resizeStartGrid.gx, resizeStartGrid.gy, gx, gy)
    didResize = true
    return
  }

  if (isMoving) {
    const rect = getRect()
    const { gx, gy } = pixelToGrid(e.clientX - rect.left, e.clientY - rect.top, viewport.value)
    const dx = gx - moveStartGrid.gx
    const dy = gy - moveStartGrid.gy
    const movePatch = { origin_x: moveOriginal.origin_x + dx, origin_y: moveOriginal.origin_y + dy }
    if (moveOriginal.shape === 'polygon' && moveOriginal.points) {
      movePatch.points = moveOriginal.points.map(p => ({ x: p.x + dx, y: p.y + dy }))
    }
    moveGhost.value = { ...moveOriginal, ...movePatch }
    didMove = true
    return
  }

  if (dungeonStore.drawMode === 'edit' && dungeonStore.selectedElement?.type === 'room') {
    const room = dungeonStore.rooms.get(dungeonStore.selectedElement.id)
    const rect = getRect()
    hoveredHandle.value = room ? hitTestHandle(e.clientX - rect.left, e.clientY - rect.top, room) : null
  } else {
    hoveredHandle.value = null
  }

  draw.onMouseMove(e, dungeonStore.drawMode, getRect())
}

function onMouseUp(e) {
  if (isPanning) { isPanning = false; return }

  if (isResizing) {
    if (didResize && resizeGhost.value) {
      const { origin_x, origin_y, width, height } = resizeGhost.value
      dungeonStore.updateRoom(resizeRoomId, { origin_x, origin_y, width, height })
    }
    isResizing = false
    resizeHandle = null
    resizeRoomId = null
    resizeStartGrid = null
    resizeOriginal = null
    resizeGhost.value = null
    dungeonStore.endRoomEdit()
    return
  }

  if (isMoving) {
    if (didMove && moveGhost.value) {
      const { origin_x, origin_y } = moveGhost.value
      const moveSavePatch = { origin_x, origin_y }
      if (moveGhost.value.shape === 'polygon') moveSavePatch.points = moveGhost.value.points
      dungeonStore.updateRoom(moveRoomId, moveSavePatch)
    }
    isMoving = false
    moveRoomId = null
    moveStartGrid = null
    moveOriginal = null
    moveGhost.value = null
    dungeonStore.endRoomEdit()
    return
  }

  if (dungeonStore.drawMode === 'room' || dungeonStore.drawMode === 'circle') {
    const result = draw.onMouseUp(e, dungeonStore.drawMode, getRect())
    if (result) {
      const { type: _type, ...roomData } = result
      dungeonStore.addRoom({
        dungeon_id: props.dungeonId,
        session_id: dungeonStore.dungeon?.session_id,
        ...roomData,
      })
    }
  }
}

function onClick(e) {
  if (didResize) { didResize = false; return }
  if (didMove)   { didMove   = false; return }

  if (dungeonStore.drawMode === 'door') {
    const rect = getRect()
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top
    const existing = findDoorAtClick(mx, my)
    if (existing) {
      dungeonStore.removeDoor(existing.roomId, existing.doorId)
    } else {
      const hit = findRoomWall(mx, my)
      if (hit) {
        const { roomId, ...doorData } = hit
        dungeonStore.addDoor(roomId, doorData)
      }
    }
    return
  }

  if (dungeonStore.drawMode === 'polygon') {
    const result = draw.onPolygonClick(e, getRect())
    if (result) {
      const { type: _type, ...roomData } = result
      dungeonStore.addRoom({
        dungeon_id: props.dungeonId,
        session_id: dungeonStore.dungeon?.session_id,
        ...roomData,
      })
    }
    return
  }

  if (dungeonStore.drawMode === 'corridor') {
    const result = draw.onCanvasClick(e, 'corridor', getRect())
    if (result) {
      const { type: _type, ...corridorData } = result
      dungeonStore.addCorridor({
        dungeon_id: props.dungeonId,
        session_id: dungeonStore.dungeon?.session_id,
        ...corridorData,
      })
    }
    return
  }

  if (dungeonStore.drawMode === 'select' || dungeonStore.drawMode === 'edit') {
    const rect = getRect()
    const { gx, gy } = pixelToGrid(e.clientX - rect.left, e.clientY - rect.top, viewport.value)
    const roomId = draw.hitTestRoom(gx, gy, dungeonStore.rooms)
    if (roomId) { dungeonStore.selectElement('room', roomId); return }
    const corridorId = draw.hitTestCorridor(gx, gy, dungeonStore.corridors)
    if (corridorId) { dungeonStore.selectElement('corridor', corridorId); return }
    dungeonStore.deselect()
  }
}

function onDoubleClick(e) {
  if (dungeonStore.drawMode !== 'select') return
  const rect = getRect()
  const { gx, gy } = pixelToGrid(e.clientX - rect.left, e.clientY - rect.top, viewport.value)
  const roomId = draw.hitTestRoom(gx, gy, dungeonStore.rooms)
  if (roomId) openAnnotation('room', roomId)
}

function openAnnotation(type, id) {
  dungeonStore.selectElement(type, id)
}

function onWheel(e) {
  if (e.ctrlKey || e.metaKey || Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1
    const rect = getRect()
    applyZoom(factor, e.clientX - rect.left, e.clientY - rect.top)
  } else {
    viewport.value = {
      ...viewport.value,
      offsetX: viewport.value.offsetX + e.deltaX,
      offsetY: viewport.value.offsetY + e.deltaY,
    }
  }
}


function onKeyDown(e) {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return
  if (e.key === 'Escape') { draw.cancel(); dungeonStore.deselect(); return }
  if (e.key === 's' || e.key === 'S') { dungeonStore.drawMode = 'select'; return }
  if (e.key === 'e' || e.key === 'E') { dungeonStore.drawMode = 'edit'; return }
  if (e.key === 'r' || e.key === 'R') { dungeonStore.drawMode = 'room'; return }
  if (e.key === 'o' || e.key === 'O') { dungeonStore.drawMode = 'circle'; return }
  if (e.key === 'c' || e.key === 'C') { dungeonStore.drawMode = 'corridor'; return }
  if (e.key === 'p' || e.key === 'P') { dungeonStore.drawMode = 'pan'; return }
  if (e.key === 'd' || e.key === 'D') { dungeonStore.drawMode = 'door'; return }
  if (e.key === 'w' || e.key === 'W') { dungeonStore.drawMode = 'polygon'; return }
  if (e.key === '=' || e.key === '+') { zoomIn(); return }
  if (e.key === '-' || e.key === '_') { zoomOut(); return }
  if ((e.key === 'Delete' || e.key === 'Backspace') && dungeonStore.selectedElement) {
    const { type, id } = dungeonStore.selectedElement
    if (type === 'room') {
      confirm('Delete this room?', () => dungeonStore.deleteRoom(id))
    } else {
      dungeonStore.deleteCorridor(id)
    }
  }
}


const resizeObserver = new ResizeObserver(entries => {
  for (const entry of entries) {
    canvasWidth.value = entry.contentRect.width
    canvasHeight.value = entry.contentRect.height
    if (canvasEl.value) {
      canvasEl.value.width = canvasWidth.value
      canvasEl.value.height = canvasHeight.value
    }
  }
})

onMounted(() => {
  ctx = canvasEl.value.getContext('2d')
  canvasWidth.value = containerEl.value.clientWidth
  canvasHeight.value = containerEl.value.clientHeight
  canvasEl.value.width = canvasWidth.value
  canvasEl.value.height = canvasHeight.value
  resizeObserver.observe(containerEl.value)
  window.addEventListener('keydown', onKeyDown)
  rafId = requestAnimationFrame(renderFrame)
})

onUnmounted(() => {
  if (rafId) cancelAnimationFrame(rafId)
  resizeObserver.disconnect()
  window.removeEventListener('keydown', onKeyDown)
})
</script>
