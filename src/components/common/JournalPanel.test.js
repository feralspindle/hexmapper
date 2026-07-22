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

const pagesOf = entries => {
  const pages = [{ pageBreak: null, entries: [] }]
  for (const e of entries) {
    if (e.kind === 'page_break') pages.push({ pageBreak: e, entries: [] })
    else pages[pages.length - 1].entries.push(e)
  }
  return pages
}

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

beforeEach(() => {
  mocks.confirm.mockReset()
  mocks.journalStore = reactive({
    entries: [entry()],
    get pages() { return pagesOf(this.entries) },
    error: null,
    init: vi.fn(),
    updateEntry: vi.fn((id, body) => Promise.resolve(entry({ id, body }))),
    removeEntry: vi.fn(),
    addProse: vi.fn(),
    addPageBreak: vi.fn(),
    exportMarkdown: vi.fn(() => ''),
  })
  mocks.sessionStore = reactive({ isGM: false, sessionName: 'Campaign' })
  mocks.authStore = reactive({ user: { id: 'user-1' } })
  mocks.characterStore = reactive({ characters: [] })
})

describe('JournalPanel entry actions', () => {
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

describe('JournalPanel pages', () => {
  const pageBreak = (overrides = {}) => entry({
    id: 'break-1',
    kind: 'page_break',
    body: '',
    created_at: '2026-07-07T02:00:00Z',
    ...overrides,
  })

  test('new page writes a break and turns to the fresh page', async () => {
    mocks.journalStore.addPageBreak.mockImplementation(() => {
      mocks.journalStore.entries.push(pageBreak())
      return Promise.resolve(pageBreak())
    })
    const wrapper = mountPanel()

    await wrapper.get('[data-testid="journal-new-page"]').trigger('click')

    expect(mocks.journalStore.addPageBreak).toHaveBeenCalled()
    expect(wrapper.get('[data-testid="journal-page-label"]').text()).toBe('page 2 of 2')
    expect(wrapper.text()).toContain('A fresh page, nothing on it yet.')
  })

  test('new page does nothing when the current page is already blank', async () => {
    mocks.journalStore.entries = [pageBreak()]
    const wrapper = mountPanel()

    await wrapper.get('[data-testid="journal-new-page"]').trigger('click')

    expect(mocks.journalStore.addPageBreak).not.toHaveBeenCalled()
  })

  test('pager starts on the last page and can turn back', async () => {
    mocks.journalStore.entries = [
      entry(),
      pageBreak(),
      entry({ id: 'entry-2', body: 'We crossed the river.', created_at: '2026-07-07T03:00:00Z' }),
    ]
    const wrapper = mountPanel()

    expect(wrapper.get('[data-testid="journal-page-label"]').text()).toBe('page 2 of 2')
    expect(wrapper.text()).toContain('We crossed the river.')
    expect(wrapper.text()).not.toContain('We made camp.')

    await wrapper.get('[data-testid="journal-page-prev"]').trigger('click')

    expect(wrapper.get('[data-testid="journal-page-label"]').text()).toBe('page 1 of 2')
    expect(wrapper.text()).toContain('We made camp.')
    expect(wrapper.get('[data-testid="journal-page-prev"]').attributes('disabled')).toBeDefined()
  })

  test('removing a page break asks first, then merges into the previous page', async () => {
    mocks.journalStore.entries = [
      entry(),
      pageBreak(),
      entry({ id: 'entry-2', body: 'We crossed the river.', created_at: '2026-07-07T03:00:00Z' }),
    ]
    mocks.journalStore.removeEntry.mockImplementation((id) => {
      mocks.journalStore.entries = mocks.journalStore.entries.filter(e => e.id !== id)
    })
    const wrapper = mountPanel()

    await wrapper.get('[data-testid="journal-page-break-delete"]').trigger('click')
    expect(mocks.confirm).toHaveBeenCalledWith(
      'Remove this page break? Its entries join the previous page.',
      expect.any(Function),
    )

    mocks.confirm.mock.calls[0][1]()
    await wrapper.vm.$nextTick()

    expect(mocks.journalStore.removeEntry).toHaveBeenCalledWith('break-1')
    expect(wrapper.find('[data-testid="journal-page-label"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('We made camp.')
    expect(wrapper.text()).toContain('We crossed the river.')
  })

  test('a page break carries a title and can be renamed inline', async () => {
    mocks.journalStore.entries = [
      entry(),
      pageBreak({ body: 'Into the Mire' }),
      entry({ id: 'entry-2', body: 'We crossed the river.', created_at: '2026-07-07T03:00:00Z' }),
    ]
    mocks.journalStore.updateEntry.mockImplementation((id, body) => {
      const target = mocks.journalStore.entries.find(e => e.id === id)
      target.body = body
      return Promise.resolve({ ...target })
    })
    const wrapper = mountPanel()

    expect(wrapper.get('[data-testid="journal-page-title"]').text()).toBe('Into the Mire')

    await wrapper.get('[data-testid="journal-page-title-edit"]').trigger('click')
    const input = wrapper.get('[data-testid="journal-page-title-input"]')
    expect(input.element.value).toBe('Into the Mire')

    await input.setValue('Out of the Mire')
    await wrapper.get('[data-testid="journal-page-title-save"]').trigger('submit')
    await wrapper.vm.$nextTick()

    expect(mocks.journalStore.updateEntry).toHaveBeenCalledWith('break-1', 'Out of the Mire')
    expect(wrapper.get('[data-testid="journal-page-title"]').text()).toBe('Out of the Mire')
  })

  test('export offers the whole journal or just the current page', async () => {
    vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:x'), revokeObjectURL: vi.fn() })
    const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    mocks.journalStore.entries = [
      entry(),
      pageBreak(),
      entry({ id: 'entry-2', body: 'We crossed the river.', created_at: '2026-07-07T03:00:00Z' }),
    ]
    const wrapper = mountPanel()

    await wrapper.get('[data-testid="journal-export"]').trigger('click')
    await wrapper.get('[data-testid="journal-export-page"]').trigger('click')
    expect(mocks.journalStore.exportMarkdown).toHaveBeenCalledWith('Campaign', { pageIndex: 1 })

    await wrapper.get('[data-testid="journal-export"]').trigger('click')
    await wrapper.get('[data-testid="journal-export-all"]').trigger('click')
    expect(mocks.journalStore.exportMarkdown).toHaveBeenCalledWith('Campaign', { pageIndex: null })

    expect(anchorClick).toHaveBeenCalledTimes(2)
    vi.unstubAllGlobals()
    anchorClick.mockRestore()
  })

  test('export skips the menu when there is a single page', async () => {
    vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:x'), revokeObjectURL: vi.fn() })
    const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    const wrapper = mountPanel()

    await wrapper.get('[data-testid="journal-export"]').trigger('click')

    expect(wrapper.find('[data-testid="journal-export-all"]').exists()).toBe(false)
    expect(mocks.journalStore.exportMarkdown).toHaveBeenCalledWith('Campaign', { pageIndex: null })
    vi.unstubAllGlobals()
    anchorClick.mockRestore()
  })

  test('search spans every page', async () => {
    mocks.journalStore.entries = [
      entry(),
      pageBreak(),
      entry({ id: 'entry-2', body: 'We crossed the river.', created_at: '2026-07-07T03:00:00Z' }),
    ]
    const wrapper = mountPanel()

    await wrapper.get('[data-testid="journal-search"]').setValue('camp')

    expect(wrapper.text()).toContain('We made camp.')
    expect(wrapper.find('[data-testid="journal-page-label"]').exists()).toBe(false)
  })
})
