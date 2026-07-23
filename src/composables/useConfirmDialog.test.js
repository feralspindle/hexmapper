import { describe, test, expect, beforeEach, vi } from 'vitest'
import { useConfirmDialog } from './useConfirmDialog.js'

describe('useConfirmDialog', () => {
  beforeEach(() => {
    useConfirmDialog().cancel()
  })

  test('confirm shows the dialog with defaults geared for deletion', () => {
    const { state, confirm } = useConfirmDialog()
    confirm('Delete this map?', () => {})

    expect(state.visible).toBe(true)
    expect(state.message).toBe('Delete this map?')
    expect(state.confirmLabel).toBe('Delete')
  })

  test('options override the label, tone, and icon', () => {
    const { state, confirm } = useConfirmDialog()
    confirm('Leave session?', () => {}, { confirmLabel: 'Leave', tone: 'neutral', confirmIcon: 'y' })

    expect(state.confirmLabel).toBe('Leave')
    expect(state.tone).toBe('neutral')
    expect(state.confirmIcon).toBe('y')
  })

  test('the tone falls back to danger', () => {
    const { state, confirm } = useConfirmDialog()
    confirm('Delete this map?', () => {}, { confirmLabel: 'Delete' })
    expect(state.tone).toBe('danger')
  })

  test('accept runs the callback and closes; cancel closes without running it', () => {
    const { state, confirm, accept, cancel } = useConfirmDialog()
    const onConfirm = vi.fn()

    confirm('Sure?', onConfirm)
    accept()
    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(state.visible).toBe(false)

    confirm('Sure?', onConfirm)
    cancel()
    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(state.visible).toBe(false)
  })

  test('the dialog state is shared across composable instances', () => {
    const a = useConfirmDialog()
    const b = useConfirmDialog()

    a.confirm('Shared?', () => {})

    expect(b.state.visible).toBe(true)
    expect(b.state.message).toBe('Shared?')
  })
})
