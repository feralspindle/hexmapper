import { describe, test, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'

const mocks = vi.hoisted(() => ({
  characterStore: {
    importCharacter: vi.fn(),
  },
}))

vi.mock('@/stores/characterStore.js', () => ({
  useCharacterStore: () => mocks.characterStore,
  statMod: (score) => Math.floor((score - 10) / 2),
}))

import NewCharacterModal from './NewCharacterModal.vue'

// The modal teleports to <body>; disabling the teleport renders it inline so the
// wrapper can query it.
const mountModal = () => mount(NewCharacterModal, { global: { stubs: { teleport: true } } })
const createButton = (wrapper) => wrapper.get('[data-testid="new-char-create"]')

describe('NewCharacterModal', () => {
  beforeEach(() => {
    mocks.characterStore.importCharacter.mockReset()
    mocks.characterStore.importCharacter.mockResolvedValue({ id: 'char-1' })
  })

  test('disables create until a name is entered', async () => {
    const wrapper = mountModal()
    expect(createButton(wrapper).attributes('disabled')).toBeDefined()

    await wrapper.get('[data-testid="new-char-name"]').setValue('Aldric')
    expect(createButton(wrapper).attributes('disabled')).toBeUndefined()
  })

  test('does not submit a blank or whitespace-only name', async () => {
    const wrapper = mountModal()
    await wrapper.get('[data-testid="new-char-name"]').setValue('   ')
    expect(createButton(wrapper).attributes('disabled')).toBeDefined()
    await createButton(wrapper).trigger('click')
    expect(mocks.characterStore.importCharacter).not.toHaveBeenCalled()
  })

  test('submits the form to the store and closes on success', async () => {
    const wrapper = mountModal()
    await wrapper.get('[data-testid="new-char-name"]').setValue('Aldric')
    await createButton(wrapper).trigger('click')
    await Promise.resolve()

    expect(mocks.characterStore.importCharacter).toHaveBeenCalledTimes(1)
    expect(mocks.characterStore.importCharacter).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Aldric', level: 1 }),
    )
    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  test('keeps the modal open when the store rejects the character', async () => {
    mocks.characterStore.importCharacter.mockResolvedValue(null)
    const wrapper = mountModal()
    await wrapper.get('[data-testid="new-char-name"]').setValue('Aldric')
    await createButton(wrapper).trigger('click')
    await Promise.resolve()

    expect(mocks.characterStore.importCharacter).toHaveBeenCalledTimes(1)
    expect(wrapper.emitted('close')).toBeUndefined()
  })

  test('cancel closes without touching the store', async () => {
    const wrapper = mountModal()
    await wrapper.get('button:not([data-testid])').trigger('click')
    // The overlay and the header X and Cancel all emit close; none may create a character.
    expect(mocks.characterStore.importCharacter).not.toHaveBeenCalled()
    expect(wrapper.emitted('close')).toBeTruthy()
  })
})
