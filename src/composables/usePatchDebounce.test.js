import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest'
import { createPatchDebouncer } from './usePatchDebounce.js'

describe('createPatchDebouncer', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  test('merges patches to different fields into one save', () => {
    const save = vi.fn()
    const saver = createPatchDebouncer(save, 600)

    saver.push('q1', { title: 'Find the bell' })
    saver.push('q1', { description: 'It sank with the chapel' })
    vi.advanceTimersByTime(600)

    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith('q1', {
      title: 'Find the bell',
      description: 'It sank with the chapel',
    })
  })

  test('later edits to the same field win', () => {
    const save = vi.fn()
    const saver = createPatchDebouncer(save, 600)

    saver.push('q1', { title: 'Fin' })
    saver.push('q1', { title: 'Find the bell' })
    vi.advanceTimersByTime(600)

    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith('q1', { title: 'Find the bell' })
  })

  test('each push resets the delay', () => {
    const save = vi.fn()
    const saver = createPatchDebouncer(save, 600)

    saver.push('q1', { title: 'a' })
    vi.advanceTimersByTime(400)
    saver.push('q1', { description: 'b' })
    vi.advanceTimersByTime(400)
    expect(save).not.toHaveBeenCalled()

    vi.advanceTimersByTime(200)
    expect(save).toHaveBeenCalledWith('q1', { title: 'a', description: 'b' })
  })

  test('ids are debounced independently', () => {
    const save = vi.fn()
    const saver = createPatchDebouncer(save, 600)

    saver.push('q1', { title: 'a' })
    saver.push('q2', { title: 'b' })
    vi.advanceTimersByTime(600)

    expect(save).toHaveBeenCalledWith('q1', { title: 'a' })
    expect(save).toHaveBeenCalledWith('q2', { title: 'b' })
  })

  test('flush saves everything pending immediately and cancels the timers', () => {
    const save = vi.fn()
    const saver = createPatchDebouncer(save, 600)

    saver.push('q1', { title: 'a' })
    saver.push('q2', { title: 'b' })
    saver.flush()

    expect(save).toHaveBeenCalledTimes(2)
    expect(save).toHaveBeenCalledWith('q1', { title: 'a' })
    expect(save).toHaveBeenCalledWith('q2', { title: 'b' })

    vi.advanceTimersByTime(600)
    expect(save).toHaveBeenCalledTimes(2)
  })

  test('a save after the timer fires starts a fresh patch', () => {
    const save = vi.fn()
    const saver = createPatchDebouncer(save, 600)

    saver.push('q1', { title: 'a' })
    vi.advanceTimersByTime(600)
    saver.push('q1', { description: 'b' })
    vi.advanceTimersByTime(600)

    expect(save).toHaveBeenNthCalledWith(1, 'q1', { title: 'a' })
    expect(save).toHaveBeenNthCalledWith(2, 'q1', { description: 'b' })
  })
})
