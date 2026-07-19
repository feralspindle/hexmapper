import { describe, test, expect, beforeEach } from 'vitest'
import { ref } from 'vue'
import {
  CELL_SIZE,
  pixelToGrid,
  pixelToCell,
  gridToPixel,
  corridorSegments,
  tokenStackLayout,
  useDungeonDraw,
} from './useDungeonDraw.js'

const rect = { left: 0, top: 0 }
const mouse = (gx, gy) => ({ clientX: gx * CELL_SIZE, clientY: gy * CELL_SIZE })

describe('grid math', () => {
  test('pixelToGrid rounds to the nearest intersection and honors offset and zoom', () => {
    expect(pixelToGrid(41, 39, { offsetX: 0, offsetY: 0, zoom: 1 })).toEqual({ gx: 2, gy: 2 })
    expect(pixelToGrid(0, 0, { offsetX: 40, offsetY: 20, zoom: 1 })).toEqual({ gx: 2, gy: 1 })
    expect(pixelToGrid(80, 80, { offsetX: 0, offsetY: 0, zoom: 2 })).toEqual({ gx: 2, gy: 2 })
  })

  test('pixelToCell floors into the containing cell', () => {
    expect(pixelToCell(39, 39, { offsetX: 0, offsetY: 0, zoom: 1 })).toEqual({ cellX: 1, cellY: 1 })
    expect(pixelToCell(40, 40, { offsetX: 0, offsetY: 0, zoom: 1 })).toEqual({ cellX: 2, cellY: 2 })
  })

  test('gridToPixel is the inverse of pixelToGrid at intersections', () => {
    const viewport = { offsetX: 13, offsetY: 7, zoom: 1.5 }
    const { px, py } = gridToPixel(4, 6, viewport)
    expect(pixelToGrid(px, py, viewport)).toEqual({ gx: 4, gy: 6 })
  })

  test('corridorSegments expands multi-point corridors and falls back to endpoints', () => {
    expect(corridorSegments({ points: [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 3 }] })).toEqual([
      { x1: 0, y1: 0, x2: 2, y2: 0 },
      { x1: 2, y1: 0, x2: 2, y2: 3 },
    ])
    expect(corridorSegments({ x1: 1, y1: 1, x2: 5, y2: 1 })).toEqual([{ x1: 1, y1: 1, x2: 5, y2: 1 }])
  })
})

describe('tokenStackLayout', () => {
  test('a lone token stays centered at full size', () => {
    const layout = tokenStackLayout([{ id: 'a', x: 3, y: 4 }])
    expect(layout.get('a')).toEqual({ dx: 0, dy: 0, scale: 1 })
  })

  test('two tokens on a cell get distinct offsets and shrink', () => {
    const layout = tokenStackLayout([
      { id: 'a', x: 3, y: 4 },
      { id: 'b', x: 3, y: 4 },
    ])
    const a = layout.get('a')
    const b = layout.get('b')
    expect(a.scale).toBe(0.6)
    expect(b.scale).toBe(0.6)
    expect(Math.hypot(a.dx - b.dx, a.dy - b.dy)).toBeGreaterThan(0.3)
  })

  test('layout is deterministic regardless of arrival order', () => {
    const forward = tokenStackLayout([
      { id: 'a', x: 0, y: 0 },
      { id: 'b', x: 0, y: 0 },
    ])
    const reversed = tokenStackLayout([
      { id: 'b', x: 0, y: 0 },
      { id: 'a', x: 0, y: 0 },
    ])
    expect(forward.get('a')).toEqual(reversed.get('a'))
    expect(forward.get('b')).toEqual(reversed.get('b'))
  })

  test('tokens on different cells are unaffected by each other', () => {
    const layout = tokenStackLayout([
      { id: 'a', x: 0, y: 0 },
      { id: 'b', x: 1, y: 0 },
    ])
    expect(layout.get('a')).toEqual({ dx: 0, dy: 0, scale: 1 })
    expect(layout.get('b')).toEqual({ dx: 0, dy: 0, scale: 1 })
  })

  test('a five-token pile keeps every position distinct', () => {
    const tokens = ['a', 'b', 'c', 'd', 'e'].map(id => ({ id, x: 2, y: 2 }))
    const layout = tokenStackLayout(tokens)
    const positions = tokens.map(t => {
      const { dx, dy, scale } = layout.get(t.id)
      expect(scale).toBe(0.42)
      return `${dx.toFixed(4)}:${dy.toFixed(4)}`
    })
    expect(new Set(positions).size).toBe(5)
  })
})

describe('useDungeonDraw', () => {
  let draw
  beforeEach(() => {
    draw = useDungeonDraw(ref({ offsetX: 0, offsetY: 0, zoom: 1 }))
  })

  test('dragging out a room normalizes negative drags and enforces a minimum size', () => {
    draw.onMouseDown(mouse(5, 5), 'room', rect)
    expect(draw.isDrawing.value).toBe(true)

    draw.onMouseMove(mouse(2, 3), 'room', rect)
    expect(draw.ghost.value).toMatchObject({ x: 2, y: 3, w: 3, h: 2 })

    const result = draw.onMouseUp(mouse(2, 3), 'room', rect)
    expect(result).toEqual({ type: 'room', origin_x: 2, origin_y: 3, width: 3, height: 2, shape: 'rect' })
    expect(draw.isDrawing.value).toBe(false)
    expect(draw.ghost.value).toBeNull()

    draw.onMouseDown(mouse(1, 1), 'room', rect)
    const dot = draw.onMouseUp(mouse(1, 1), 'room', rect)
    expect(dot).toMatchObject({ width: 1, height: 1 })
  })

  test('circle mode produces a circle-shaped room', () => {
    draw.onMouseDown(mouse(0, 0), 'circle', rect)
    const result = draw.onMouseUp(mouse(4, 4), 'circle', rect)

    expect(result.shape).toBe('circle')
  })

  test('mouse down in select mode does nothing', () => {
    draw.onMouseDown(mouse(0, 0), 'select', rect)
    expect(draw.isDrawing.value).toBe(false)
    expect(draw.onMouseUp(mouse(1, 1), 'select', rect)).toBeNull()
  })

  test('corridors accumulate click points and commit start/end coordinates', () => {
    draw.onCanvasClick(mouse(0, 0), 'corridor', rect)
    draw.onCanvasClick(mouse(4, 0), 'corridor', rect)
    draw.onCanvasClick(mouse(4, 6), 'corridor', rect)

    const result = draw.commitCorridor()
    expect(result).toEqual({
      type: 'corridor',
      points: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 6 }],
      x1: 0, y1: 0, x2: 4, y2: 6,
    })
    expect(draw.isDrawing.value).toBe(false)
  })

  test('a corridor with a single point cannot be committed', () => {
    draw.onCanvasClick(mouse(0, 0), 'corridor', rect)
    expect(draw.commitCorridor()).toBeNull()
    expect(draw.drawState.value).toBe('corridor_drawing')
  })

  test('polygons close when clicking near the first vertex and derive their bounding box', () => {
    draw.onPolygonClick(mouse(0, 0), rect)
    draw.onPolygonClick(mouse(6, 0), rect)
    draw.onPolygonClick(mouse(6, 4), rect)
    expect(draw.drawState.value).toBe('drawing_polygon')

    const result = draw.onPolygonClick(mouse(1, 1), rect)
    expect(result).toMatchObject({
      type: 'room',
      shape: 'polygon',
      points: [{ x: 0, y: 0 }, { x: 6, y: 0 }, { x: 6, y: 4 }],
      origin_x: 0,
      origin_y: 0,
      width: 6,
      height: 4,
    })
    expect(draw.isDrawing.value).toBe(false)
  })

  test('a far click keeps extending the polygon instead of closing it', () => {
    draw.onPolygonClick(mouse(0, 0), rect)
    draw.onPolygonClick(mouse(6, 0), rect)
    draw.onPolygonClick(mouse(6, 4), rect)

    const result = draw.onPolygonClick(mouse(3, 3), rect)
    expect(result).toBeNull()
    expect(draw.ghost.value.points).toHaveLength(4)
  })

  test('cancel resets any in-progress drawing', () => {
    draw.onCanvasClick(mouse(0, 0), 'corridor', rect)
    draw.cancel()

    expect(draw.drawState.value).toBe('idle')
    expect(draw.ghost.value).toBeNull()
    expect(draw.commitCorridor()).toBeNull()
  })

  describe('hit testing', () => {
    test('rectangular rooms hit inclusively on their bounds', () => {
      const rooms = new Map([['r1', { origin_x: 2, origin_y: 2, width: 4, height: 3, shape: 'rect' }]])
      expect(draw.hitTestRoom(2, 2, rooms)).toBe('r1')
      expect(draw.hitTestRoom(6, 5, rooms)).toBe('r1')
      expect(draw.hitTestRoom(7, 5, rooms)).toBeNull()
    })

    test('circle rooms hit within the ellipse only', () => {
      const rooms = new Map([['c1', { origin_x: 0, origin_y: 0, width: 4, height: 4, shape: 'circle' }]])
      expect(draw.hitTestRoom(2, 2, rooms)).toBe('c1')
      expect(draw.hitTestRoom(0, 0, rooms)).toBeNull()
    })

    test('polygon rooms use point-in-polygon', () => {
      const rooms = new Map([
        ['p1', { shape: 'polygon', points: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 0, y: 4 }] }],
      ])
      expect(draw.hitTestRoom(1, 1, rooms)).toBe('p1')
      expect(draw.hitTestRoom(3, 3, rooms)).toBeNull()
    })

    test('corridors hit within the distance threshold of any segment', () => {
      const corridors = new Map([
        ['co1', { points: [{ x: 0, y: 0 }, { x: 10, y: 0 }] }],
      ])
      expect(draw.hitTestCorridor(5, 0.5, corridors)).toBe('co1')
      expect(draw.hitTestCorridor(5, 2, corridors)).toBeNull()
      expect(draw.hitTestCorridor(-2, 0, corridors)).toBeNull()
    })
  })
})
