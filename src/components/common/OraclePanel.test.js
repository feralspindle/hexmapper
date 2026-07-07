import { describe, test, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import OraclePanel from './OraclePanel.vue'

const mocks = vi.hoisted(() => ({
  oracleStore: {
    tables: [],
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
  },
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
    mocks.oracleStore.tables = []
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
    mocks.oracleStore.tables = [{ id: 'table-1', name: 'Encounters', description: '', mode: 'weighted' }]
    mocks.oracleStore.rowsByTable = {
      'table-1': [{ id: 'row-1', table_id: 'table-1', weight: 2, result: 'Bandits', position: 0 }],
    }
    const wrapper = mount(OraclePanel)

    await wrapper.get('[data-testid="oracle-roll-table"]').trigger('click')

    expect(wrapper.get('[data-testid="oracle-table-name"]').element.value).toBe('Encounters')
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
    mocks.oracleStore.tables = [
      { id: 'table-1', name: 'Encounters', description: '', mode: 'weighted' },
      { id: 'table-2', name: 'Monsters', description: '', mode: 'weighted' },
    ]
    mocks.oracleStore.rowsByTable = {
      'table-1': [{ id: 'row-1', table_id: 'table-1', weight: 1, result: 'Bandits', position: 0, subtable_id: null }],
      'table-2': [],
    }
    const wrapper = mount(OraclePanel)

    const select = wrapper.get('[data-testid="oracle-row-chain"]')
    // own table is not offered as a target
    expect(select.findAll('option').map(o => o.text())).not.toContain('→ Encounters')

    await select.setValue('table-2')
    expect(mocks.oracleStore.updateRow).toHaveBeenCalledWith('row-1', { subtable_id: 'table-2' })

    await select.setValue('')
    expect(mocks.oracleStore.updateRow).toHaveBeenCalledWith('row-1', { subtable_id: null })
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
