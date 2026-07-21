import { describe, test, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import OraclePanel from './OraclePanel.vue'

const mocks = vi.hoisted(() => ({
  oracleStore: {
    tables: [],
    sessionTables: [],
    libraryTables: [],
    sessionTableIds: new Set(),
    rowsByTable: {},
    rolls: [],
    loading: false,
    rolling: false,
    error: null,
    createTable: vi.fn(),
    createRow: vi.fn(),
    updateTable: vi.fn(),
    deleteTable: vi.fn(),
    updateRow: vi.fn(),
    deleteRow: vi.fn(),
    rollYesNo: vi.fn(),
    rollEventPrompt: vi.fn(),
    rollTable: vi.fn(),
    listPacks: vi.fn(() => Promise.resolve([])),
    installPack: vi.fn(),
    importTables: vi.fn(),
    attachTable: vi.fn(),
    detachTable: vi.fn(),
  },
  journalStore: {
    pin: vi.fn(),
  },
}))

vi.mock('@/stores/journalStore.js', () => ({
  useJournalStore: () => mocks.journalStore,
}))

vi.mock('@/stores/authStore.js', () => ({
  useAuthStore: () => ({ user: { id: 'u1' } }),
}))

vi.mock('@/stores/oracleStore.js', () => ({
  YES_NO_ODDS: [
    { value: 'impossible', label: 'Impossible' },
    { value: 'unlikely', label: 'Unlikely' },
    { value: 'even', label: '50/50' },
    { value: 'likely', label: 'Likely' },
    { value: 'almost_certain', label: 'Almost Certain' },
  ],
  useOracleStore: () => mocks.oracleStore,
}))

describe('OraclePanel', () => {
  beforeEach(() => {
    localStorage.clear()
    mocks.oracleStore.tables = []
    mocks.oracleStore.sessionTables = []
    mocks.oracleStore.libraryTables = []
    mocks.oracleStore.sessionTableIds = new Set()
    mocks.oracleStore.rowsByTable = {}
    mocks.oracleStore.rolls = []
    mocks.oracleStore.error = null
    mocks.oracleStore.rolling = false
    for (const value of Object.values(mocks.oracleStore)) {
      if (typeof value === 'function' && 'mockClear' in value) value.mockClear()
    }
  })

  test('rolls the yes/no oracle with question and odds', async () => {
    const wrapper = mount(OraclePanel)

    await wrapper.get('[data-testid="oracle-question"]').setValue('Is the bridge guarded?')
    await wrapper.get('[data-testid="oracle-odds"]').setValue('likely')
    await wrapper.get('[data-testid="oracle-roll-yes-no"]').trigger('click')

    expect(mocks.oracleStore.rollYesNo).toHaveBeenCalledWith({
      question: 'Is the bridge guarded?',
      odds: 'likely',
    })
  })

  test('creates a table with one starter row', async () => {
    mocks.oracleStore.createTable.mockResolvedValue({ id: 'table-1' })
    const wrapper = mount(OraclePanel)

    await wrapper.get('[data-testid="oracle-table-new"]').trigger('click')

    expect(mocks.oracleStore.createTable).toHaveBeenCalledWith({
      name: 'New Table',
      description: '',
      mode: 'weighted',
    })
    expect(mocks.oracleStore.createRow).toHaveBeenCalledWith('table-1', {
      weight: 1,
      result: 'First result',
      notes: '',
      position: 0,
    })
  })

  test('renders table rolls and sends selected table id', async () => {
    mocks.oracleStore.sessionTables = [{ id: 'table-1', name: 'Encounters', description: '', mode: 'weighted', created_by: 'u1' }]
    mocks.oracleStore.rowsByTable = {
      'table-1': [{ id: 'row-1', table_id: 'table-1', weight: 2, result: 'Bandits', position: 0 }],
    }
    const wrapper = mount(OraclePanel)

    await wrapper.get('[data-testid="oracle-roll-table"]').trigger('click')

    expect(wrapper.get('[data-testid="oracle-table-name"]').element.value).toBe('Encounters')
    // rows live behind the collapse toggle
    expect(wrapper.find('[data-testid="oracle-row-result"]').exists()).toBe(false)
    await wrapper.get('[data-testid="oracle-collapse"]').trigger('click')
    expect(wrapper.get('[data-testid="oracle-row-result"]').element.value).toBe('Bandits')
    expect(mocks.oracleStore.rollTable).toHaveBeenCalledWith('table-1', null)
  })

  test('chained roll history shows every step in the chain', () => {
    mocks.oracleStore.rolls = [{
      id: 'roll-1',
      display_name: 'Player',
      kind: 'table',
      table_name: 'Encounter',
      result: {
        table_mode: 'weighted',
        result: 'monsters ahead',
        notes: '',
        chain: [
          { row_id: 'r1', table_name: 'Encounter', result: 'monsters ahead' },
          { row_id: 'r2', table_name: 'Monster', result: '7 goblins' },
          { row_id: 'r3', table_name: 'Reaction', result: 'hostile' },
        ],
      },
    }]
    const wrapper = mount(OraclePanel)

    const chain = wrapper.get('[data-testid="oracle-roll-chain"]')
    expect(chain.text()).toContain('Monster: 7 goblins')
    expect(chain.text()).toContain('Reaction: hostile')
    expect(chain.text()).not.toContain('chain stopped')
  })

  test('chain select writes subtable_id and null clears it', async () => {
    const encounters = { id: 'table-1', name: 'Encounters', description: '', mode: 'weighted', created_by: 'u1' }
    const monsters = { id: 'table-2', name: 'Monsters', description: '', mode: 'weighted', created_by: 'u1' }
    mocks.oracleStore.sessionTables = [encounters]
    mocks.oracleStore.libraryTables = [encounters, monsters]
    mocks.oracleStore.sessionTableIds = new Set(['table-1'])
    mocks.oracleStore.rowsByTable = {
      'table-1': [{ id: 'row-1', table_id: 'table-1', weight: 1, result: 'Bandits', position: 0, subtable_id: null }],
      'table-2': [],
    }
    const wrapper = mount(OraclePanel)
    await wrapper.get('[data-testid="oracle-collapse"]').trigger('click')

    const select = wrapper.get('[data-testid="oracle-row-chain"]')
    // own table is not offered as a target
    expect(select.findAll('option').map(o => o.text())).not.toContain('→ Encounters')

    await select.setValue('table-2')
    expect(mocks.oracleStore.updateRow).toHaveBeenCalledWith('row-1', { subtable_id: 'table-2' })

    await select.setValue('')
    expect(mocks.oracleStore.updateRow).toHaveBeenCalledWith('row-1', { subtable_id: null })
  })

  test('pinning a roll snapshots it to the journal', async () => {
    mocks.oracleStore.rolls = [{
      id: 'roll-1',
      display_name: 'Player',
      kind: 'yes_no',
      question: 'Is the bridge safe?',
      result: { label: 'Yes, but...', roll: 43 },
    }]
    const wrapper = mount(OraclePanel)

    await wrapper.get('[data-testid="oracle-pin"]').trigger('click')

    expect(mocks.journalStore.pin).toHaveBeenCalledWith({
      source: 'oracle',
      label: 'Yes / No',
      text: 'Yes, but... (43)',
      detail: 'Is the bridge safe?',
    })
  })

  test('library rows toggle session membership and delete for real', async () => {
    const mine = { id: 'table-1', name: 'Encounters', created_by: 'u1' }
    const other = { id: 'table-2', name: 'Weather', created_by: 'u1' }
    mocks.oracleStore.libraryTables = [mine, other]
    mocks.oracleStore.sessionTableIds = new Set(['table-1'])
    const wrapper = mount(OraclePanel)

    const items = wrapper.findAll('[data-testid="oracle-library-item"]')
    expect(items).toHaveLength(2)

    await items[0].get('[data-testid="oracle-library-toggle"]').trigger('click')
    expect(mocks.oracleStore.detachTable).toHaveBeenCalledWith('table-1')

    await items[1].get('[data-testid="oracle-library-toggle"]').trigger('click')
    expect(mocks.oracleStore.attachTable).toHaveBeenCalledWith('table-2')

    await items[0].get('[data-testid="oracle-library-delete"]').trigger('click')
    expect(mocks.oracleStore.deleteTable).toHaveBeenCalledWith('table-1')
  })

  test('removing a session table detaches instead of deleting', async () => {
    mocks.oracleStore.sessionTables = [{ id: 'table-1', name: 'Encounters', created_by: 'u1' }]
    const wrapper = mount(OraclePanel)

    await wrapper.get('[data-testid="oracle-detach"]').trigger('click')

    expect(mocks.oracleStore.detachTable).toHaveBeenCalledWith('table-1')
    expect(mocks.oracleStore.deleteTable).not.toHaveBeenCalled()
  })

  test('a partner table renders read-only rows without edit controls', async () => {
    mocks.oracleStore.sessionTables = [{ id: 'table-9', name: 'Their Omens', description: 'shared', created_by: 'u2' }]
    mocks.oracleStore.rowsByTable = {
      'table-9': [{ id: 'row-9', table_id: 'table-9', weight: 3, result: 'A comet', position: 0 }],
    }
    const wrapper = mount(OraclePanel)
    await wrapper.get('[data-testid="oracle-collapse"]').trigger('click')

    expect(wrapper.find('[data-testid="oracle-row-new"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="oracle-row-result"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="oracle-row"]').text()).toContain('A comet')
    expect(wrapper.find('[data-testid="oracle-roll-table"]').exists()).toBe(true)
  })

  test('library filter appears past 8 tables and narrows by name or tag', async () => {
    mocks.oracleStore.libraryTables = Array.from({ length: 9 }, (_, i) => (
      { id: `t${i}`, name: `Table ${i}`, created_by: 'u1', tag: i === 3 ? 'hex.terrain' : null }
    ))
    const wrapper = mount(OraclePanel)

    await wrapper.get('[data-testid="oracle-library-filter"]').setValue('hex.terr')
    expect(wrapper.findAll('[data-testid="oracle-library-item"]')).toHaveLength(1)
    expect(wrapper.get('[data-testid="oracle-library-item"]').text()).toContain('Table 3')
  })

  test('the tags help section documents every wired tag', () => {
    const wrapper = mount(OraclePanel)

    const help = wrapper.get('[data-testid="oracle-tags-help"]')
    for (const tag of ['weather', 'hex.terrain', 'hex.poi', 'hex.encounter', 'crawl.encounter', 'dungeon.stocking', 'prompt.action', 'prompt.theme', 'prompt.subject', 'prompt.location', 'prompt.complication']) {
      expect(help.text()).toContain(tag)
    }
    expect(help.text()).toContain('added to this session')
  })

  test('json import parses a bundle, sends it, and reports the result', async () => {
    mocks.oracleStore.importTables.mockResolvedValue({ installed_tables: 2, installed_rows: 4, replaced_tables: 1 })
    const wrapper = mount(OraclePanel)

    expect(wrapper.find('[data-testid="oracle-import"]').exists()).toBe(false)
    await wrapper.get('[data-testid="oracle-import-toggle"]').trigger('click')

    const bundle = { tables: [{ name: 'Reaction', rows: [{ result: 'Hostile' }] }] }
    await wrapper.get('[data-testid="oracle-import-text"]').setValue(JSON.stringify(bundle))
    await wrapper.get('[data-testid="oracle-import-replace"]').setValue(true)
    await wrapper.get('[data-testid="oracle-import-run"]').trigger('click')
    await new Promise(resolve => setTimeout(resolve))

    expect(mocks.oracleStore.importTables).toHaveBeenCalledWith({
      tables: bundle.tables,
      replace: true,
    })
    expect(wrapper.get('[data-testid="oracle-import-summary"]').text())
      .toBe('Imported 2 tables (4 rows), replaced 1.')
    expect(wrapper.get('[data-testid="oracle-import-text"]').element.value).toBe('')
  })

  test('json import accepts a bare array of tables', async () => {
    mocks.oracleStore.importTables.mockResolvedValue({ installed_tables: 1, installed_rows: 1, replaced_tables: 0 })
    const wrapper = mount(OraclePanel)
    await wrapper.get('[data-testid="oracle-import-toggle"]').trigger('click')

    const tables = [{ name: 'Mood', rows: [{ result: 'Grim' }] }]
    await wrapper.get('[data-testid="oracle-import-text"]').setValue(JSON.stringify(tables))
    await wrapper.get('[data-testid="oracle-import-run"]').trigger('click')

    expect(mocks.oracleStore.importTables).toHaveBeenCalledWith({ tables, replace: false })
  })

  test('json import rejects malformed input without calling the api', async () => {
    const wrapper = mount(OraclePanel)
    await wrapper.get('[data-testid="oracle-import-toggle"]').trigger('click')

    await wrapper.get('[data-testid="oracle-import-text"]').setValue('{ not json')
    await wrapper.get('[data-testid="oracle-import-run"]').trigger('click')
    expect(wrapper.get('[data-testid="oracle-import-error"]').text()).toContain('Not valid JSON')

    await wrapper.get('[data-testid="oracle-import-text"]').setValue('{ "tables": [] }')
    await wrapper.get('[data-testid="oracle-import-run"]').trigger('click')
    expect(wrapper.get('[data-testid="oracle-import-error"]').text()).toContain('Expected')

    expect(mocks.oracleStore.importTables).not.toHaveBeenCalled()
  })

  test('json import surfaces server rejections', async () => {
    mocks.oracleStore.importTables.mockImplementation(() => {
      mocks.oracleStore.error = 'bad request: tables already exist'
      return Promise.resolve(null)
    })
    const wrapper = mount(OraclePanel)
    await wrapper.get('[data-testid="oracle-import-toggle"]').trigger('click')

    await wrapper.get('[data-testid="oracle-import-text"]').setValue('[{ "name": "Dupe", "rows": [{ "result": "x" }] }]')
    await wrapper.get('[data-testid="oracle-import-run"]').trigger('click')
    await new Promise(resolve => setTimeout(resolve))

    expect(wrapper.get('[data-testid="oracle-import-error"]').text()).toBe('bad request: tables already exist')
  })

  test('content packs list and install', async () => {
    mocks.oracleStore.listPacks.mockResolvedValue([
      { id: 'shadowdark-starter', name: 'Shadowdark Starter', description: 'tables', tables: 21, rows: 200 },
    ])
    mocks.oracleStore.installPack.mockResolvedValue({ installed_tables: 21, installed_rows: 200 })
    const wrapper = mount(OraclePanel)
    await new Promise(resolve => setTimeout(resolve))

    const pack = wrapper.get('[data-testid="oracle-pack"]')
    expect(pack.text()).toContain('Shadowdark Starter')
    expect(pack.text()).toContain('21 tables')

    await wrapper.get('[data-testid="oracle-pack-install"]').trigger('click')
    expect(mocks.oracleStore.installPack).toHaveBeenCalledWith('shadowdark-starter')
  })
})
