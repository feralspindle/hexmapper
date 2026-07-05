import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import ConfirmDialog from './ConfirmDialog.vue'
import { useConfirmDialog } from '@/composables/useConfirmDialog.js'

describe('ConfirmDialog component', () => {
  let wrapper

  beforeEach(() => {
    useConfirmDialog().cancel()
    wrapper = mount(ConfirmDialog, { attachTo: document.body })
  })

  afterEach(() => {
    wrapper.unmount()
    document.body.innerHTML = ''
  })

  const dialogText = () => document.body.textContent

  test('renders nothing until confirm() is called', async () => {
    expect(document.body.querySelector('.fixed')).toBeNull()

    useConfirmDialog().confirm('Delete this map?', () => {})
    await wrapper.vm.$nextTick()

    expect(dialogText()).toContain('Delete this map?')
    expect(dialogText()).toContain('Delete')
    expect(dialogText()).toContain('Cancel')
  })

  test('the confirm button runs the callback and closes', async () => {
    const onConfirm = vi.fn()
    useConfirmDialog().confirm('Sure?', onConfirm, { confirmLabel: 'Leave' })
    await wrapper.vm.$nextTick()

    const buttons = [...document.body.querySelectorAll('button')]
    buttons.find(b => b.textContent.includes('Leave')).click()
    await wrapper.vm.$nextTick()

    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(document.body.querySelector('.fixed')).toBeNull()
  })

  test('cancel closes without running the callback', async () => {
    const onConfirm = vi.fn()
    useConfirmDialog().confirm('Sure?', onConfirm)
    await wrapper.vm.$nextTick()

    const buttons = [...document.body.querySelectorAll('button')]
    buttons.find(b => b.textContent.includes('Cancel')).click()
    await wrapper.vm.$nextTick()

    expect(onConfirm).not.toHaveBeenCalled()
    expect(document.body.querySelector('.fixed')).toBeNull()
  })

  test('clicking the backdrop cancels', async () => {
    const onConfirm = vi.fn()
    useConfirmDialog().confirm('Sure?', onConfirm)
    await wrapper.vm.$nextTick()

    document.body.querySelector('.bg-black\\/60').click()
    await wrapper.vm.$nextTick()

    expect(onConfirm).not.toHaveBeenCalled()
    expect(document.body.querySelector('.fixed')).toBeNull()
  })
})
