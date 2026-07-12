import { describe, test, expect, beforeEach, vi } from 'vitest'

const kit = vi.hoisted(() => ({}))

vi.mock('@/lib/realtime.js', async () => {
  const { createRealtimeMock } = await import('../../test/helpers/storeTestKit.js')
  return createRealtimeMock(kit)
})

import { realtime } from '@/lib/realtime.js'
import { createSessionChannel } from './sessionChannel.js'

describe('createSessionChannel', () => {
  beforeEach(() => {
    kit.channels = []
    vi.mocked(realtime.removeChannel)?.mockClear?.()
  })

  test('begin returns a generation that close invalidates', () => {
    const session = createSessionChannel()
    const gen = session.begin('s1')
    expect(session.key).toBe('s1')
    expect(session.isCurrent(gen)).toBe(true)
    session.close()
    expect(session.key).toBe(null)
    expect(session.isCurrent(gen)).toBe(false)
  })

  test('a later begin invalidates the previous generation', () => {
    const session = createSessionChannel()
    const gen1 = session.begin('s1')
    const gen2 = session.begin('s2')
    expect(session.isCurrent(gen1)).toBe(false)
    expect(session.isCurrent(gen2)).toBe(true)
    expect(session.key).toBe('s2')
  })

  test('open wires refresh on first SUBSCRIBED exactly once', () => {
    const session = createSessionChannel()
    session.begin('s1')
    const refresh = vi.fn()
    session.open('chan:s1', { sessionId: 's1', refresh })
    const channel = kit.channels.at(-1)
    channel.statusCallback('SUBSCRIBED')
    channel.statusCallback('SUBSCRIBED')
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  test('open wires refresh as the onReconnect callback', () => {
    const session = createSessionChannel()
    session.begin('s1')
    const refresh = vi.fn()
    session.open('chan:s1', { sessionId: 's1', refresh })
    const channel = kit.channels.at(-1)
    channel.options.onReconnect()
    expect(refresh).toHaveBeenCalledTimes(1)
    expect(refresh).toHaveBeenCalledWith(session.generation)
  })

  test('a stale channel refresh is dropped after close', () => {
    const session = createSessionChannel()
    session.begin('s1')
    const refresh = vi.fn()
    session.open('chan:s1', { sessionId: 's1', refresh })
    const channel = kit.channels.at(-1)
    session.close()
    channel.options.onReconnect()
    channel.statusCallback('SUBSCRIBED')
    expect(refresh).not.toHaveBeenCalled()
  })

  test('close removes every opened channel', () => {
    const session = createSessionChannel()
    session.begin('s1')
    session.open('a:s1', { sessionId: 's1' })
    session.open('b:s1', { sessionId: 's1' })
    const removeSpy = vi.spyOn(realtime, 'removeChannel')
    session.close()
    expect(removeSpy).toHaveBeenCalledTimes(2)
  })

  test('configure attaches handlers before subscribe', () => {
    const session = createSessionChannel()
    session.begin('s1')
    const handler = vi.fn()
    session.open('chan:s1', { sessionId: 's1' }, ch =>
      ch.on('postgres_changes', { event: '*', table: 't' }, handler),
    )
    const channel = kit.channels.at(-1)
    channel.emitPostgres('t', 'INSERT', { id: 'x' })
    expect(handler).toHaveBeenCalledTimes(1)
  })

  test('open without refresh sets no onReconnect', () => {
    const session = createSessionChannel()
    session.begin('s1')
    session.open('chan:s1', { sessionId: 's1' })
    const channel = kit.channels.at(-1)
    expect(channel.options.onReconnect).toBeUndefined()
  })

  test('open passes broadcast config through', () => {
    const session = createSessionChannel()
    session.begin('s1')
    session.open('chan:s1', { sessionId: 's1', config: { broadcast: { self: true } } })
    const channel = kit.channels.at(-1)
    expect(channel.options.config).toEqual({ broadcast: { self: true } })
  })
})
