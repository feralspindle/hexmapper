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
  },
  journalStore: {
    pin: vi.fn(),
  },
}))

vi.mock('@/stores/journalStore.js', () => ({
  useJournalStore: () => mocks.journalStore,
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
})
