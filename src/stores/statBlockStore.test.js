import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { resetKit } from '../../test/helpers/storeTestKit.js'

const kit = vi.hoisted(() => ({}))

vi.mock('@/lib/realtime.js', async () => {
  const { createRealtimeMock } = await import('../../test/helpers/storeTestKit.js')
  return createRealtimeMock(kit)
})
vi.mock('@/lib/apiClient.js', async () => {
  const { createApiClientMock } = await import('../../test/helpers/storeTestKit.js')
  return createApiClientMock(kit)
})

import { useStatBlockStore, blankStatBlock } from './statBlockStore.js'

const block = (overrides = {}) => ({
  id: 'sb-1',
  session_id: 'sess-1',
  created_by: 'user-1',
  kind: 'monster',
  data: { ...blankStatBlock('Goblin'), maxHp: 7, currentHp: 7 },
  ...overrides,
})

describe('statBlockStore', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    setActivePinia(createPinia())
    resetKit(kit)
  })

  afterEach(() => {
    useStatBlockStore().cleanup()
    vi.useRealTimers()
  })

  test('init loads blocks and subscribes', async () => {
    kit.api['get /stat-blocks?session_id=sess-1'] = [block(), block({ id: 'sb-2', kind: 'npc' })]
    const store = useStatBlockStore()
    await store.init('sess-1')

    expect(store.blocks).toHaveLength(2)
    expect(store.monsters).toHaveLength(1)
    expect(store.npcs).toHaveLength(1)
    expect(kit.channels.map(c => c.name)).toContain('stat-blocks:sess-1')
  })

  test('createBlock posts and applies the returned row', async () => {
    kit.api['get /stat-blocks?session_id=sess-1'] = []
    kit.api['post /stat-blocks'] = body => ({ id: 'sb-new', ...body })
    const store = useStatBlockStore()
    await store.init('sess-1')

    const row = await store.createBlock('monster', blankStatBlock('Ogre'))
    expect(row.id).toBe('sb-new')
    expect(store.blocks).toHaveLength(1)
    expect(store.blocks[0].data.name).toBe('Ogre')
  })

  test('updateData debounces into one patch with the merged blob', async () => {
    kit.api['get /stat-blocks?session_id=sess-1'] = [block()]
    const store = useStatBlockStore()
    await store.init('sess-1')

    store.updateData('sb-1', { ac: 13 })
    store.updateData('sb-1', { move: 'far' })
    expect(kit.apiClient.patch).not.toHaveBeenCalled()

    vi.advanceTimersByTime(900)
    expect(kit.apiClient.patch).toHaveBeenCalledTimes(1)
    const [path, body] = kit.apiClient.patch.mock.calls[0]
    expect(path).toBe('/stat-blocks/sb-1')
    expect(body.data.ac).toBe(13)
    expect(body.data.move).toBe('far')
  })

  test('adjustHp clamps between zero and max', async () => {
    kit.api['get /stat-blocks?session_id=sess-1'] = [block()]
    const store = useStatBlockStore()
    await store.init('sess-1')

    store.adjustHp('sb-1', -3)
    expect(store.blocks[0].data.currentHp).toBe(4)
    store.adjustHp('sb-1', -10)
    expect(store.blocks[0].data.currentHp).toBe(0)
    store.adjustHp('sb-1', 99)
    expect(store.blocks[0].data.currentHp).toBe(7)
  })

  test('realtime update echo is skipped while a save is pending', async () => {
    kit.api['get /stat-blocks?session_id=sess-1'] = [block()]
    const store = useStatBlockStore()
    await store.init('sess-1')
    const channel = kit.channels.find(c => c.name === 'stat-blocks:sess-1')

    store.updateData('sb-1', { ac: 15 })
    await channel.emitPostgres('stat_blocks', 'UPDATE', block({ data: { ...block().data, ac: 10 } }))
    expect(store.blocks[0].data.ac).toBe(15)

    vi.advanceTimersByTime(900)
    await channel.emitPostgres('stat_blocks', 'UPDATE', block({ data: { ...block().data, ac: 12 } }))
    expect(store.blocks[0].data.ac).toBe(12)
  })

  test('realtime delete removes the row', async () => {
    kit.api['get /stat-blocks?session_id=sess-1'] = [block()]
    const store = useStatBlockStore()
    await store.init('sess-1')
    const channel = kit.channels.find(c => c.name === 'stat-blocks:sess-1')

    await channel.emitPostgres('stat_blocks', 'DELETE', null, { id: 'sb-1' })
    expect(store.blocks).toHaveLength(0)
  })

  test('removeBlock deletes optimistically', async () => {
    kit.api['get /stat-blocks?session_id=sess-1'] = [block()]
    const store = useStatBlockStore()
    await store.init('sess-1')

    await store.removeBlock('sb-1')
    expect(store.blocks).toHaveLength(0)
    expect(kit.apiClient.delete).toHaveBeenCalledWith('/stat-blocks/sb-1', 'stat_block_delete')
  })

  test('duplicateBlock posts a copy of the data', async () => {
    kit.api['get /stat-blocks?session_id=sess-1'] = [block()]
    kit.api['post /stat-blocks'] = body => ({ id: 'sb-copy', ...body })
    const store = useStatBlockStore()
    await store.init('sess-1')

    const copy = await store.duplicateBlock('sb-1')
    expect(copy.id).toBe('sb-copy')
    expect(copy.data.name).toBe('Goblin')
    expect(store.blocks).toHaveLength(2)
  })
})
