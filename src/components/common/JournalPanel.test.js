import { beforeEach, describe, expect, test, vi } from 'vitest'
import { reactive } from 'vue'
import { mount } from '@vue/test-utils'
import JournalPanel from './JournalPanel.vue'

const mocks = vi.hoisted(() => ({
  confirm: vi.fn(),
  journalStore: null,
  sessionStore: null,
  authStore: null,
  characterStore: null,
}))

vi.mock('@/stores/journalStore.js', () => ({ useJournalStore: () => mocks.journalStore }))
vi.mock('@/stores/sessionStore.js', () => ({ useSessionStore: () => mocks.sessionStore }))
vi.mock('@/stores/authStore.js', () => ({ useAuthStore: () => mocks.authStore }))
vi.mock('@/stores/characterStore.js', () => ({ useCharacterStore: () => mocks.characterStore }))
vi.mock('@/composables/useConfirmDialog.js', () => ({
  useConfirmDialog: () => ({ confirm: mocks.confirm }),
}))

const entry = (overrides = {}) => ({
  id: 'entry-1',
  author_user_id: 'user-1',
  author_name: 'Hannah',
  kind: 'prose',
  body: 'We made camp.',
  game_date: { year: 2, month: 3, day: 14 },
  created_at: '2026-07-07T01:00:00Z',
  ...overrides,
})

function mountPanel() {
  return mount(JournalPanel, { props: { sessionId: 'session-1' } })
}

describe('JournalPanel entry actions', () => {
  beforeEach(() => {
    mocks.confirm.mockReset()
    mocks.journalStore = reactive({
      entries: [entry()],
      error: null,
      init: vi.fn(),
      updateEntry: vi.fn((id, body) => Promise.resolve(entry({ id, body }))),
      removeEntry: vi.fn(),
      addProse: vi.fn(),
      exportMarkdown: vi.fn(() => ''),
    })
    mocks.sessionStore = reactive({ isGM: false, sessionName: 'Campaign' })
    mocks.authStore = reactive({ user: { id: 'user-1' } })
    mocks.characterStore = reactive({ characters: [] })
  })

  test('an author can edit a prose entry inline', async () => {
    const wrapper = mountPanel()

    await wrapper.get('[data-testid="journal-edit"]').trigger('click')
    const input = wrapper.get('[data-testid="journal-edit-input"]')
    expect(input.element.value).toBe('We made camp.')

    await input.setValue('We crossed the river.')
    await wrapper.get('[data-testid="journal-edit-save"]').trigger('click')

    expect(mocks.journalStore.updateEntry).toHaveBeenCalledWith('entry-1', 'We crossed the river.')
    expect(wrapper.find('[data-testid="journal-edit-input"]').exists()).toBe(false)
  })

  test('delete asks for confirmation before removing the entry', async () => {
    const wrapper = mountPanel()

    await wrapper.get('[data-testid="journal-delete"]').trigger('click')

    expect(mocks.confirm).toHaveBeenCalledWith(
      'Delete this journal entry?',
      expect.any(Function),
    )
    expect(mocks.journalStore.removeEntry).not.toHaveBeenCalled()

    mocks.confirm.mock.calls[0][1]()
    expect(mocks.journalStore.removeEntry).toHaveBeenCalledWith('entry-1')
  })

  test('another player cannot edit or delete the entry', () => {
    mocks.authStore.user.id = 'user-2'
    const wrapper = mountPanel()

    expect(wrapper.find('[data-testid="journal-edit"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="journal-delete"]').exists()).toBe(false)
  })
})
