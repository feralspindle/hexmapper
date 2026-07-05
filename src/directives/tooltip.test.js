import { describe, test, expect, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { vTooltip } from './tooltip.js'

function mountWithTooltip(template) {
  return mount(
    { template },
    { global: { directives: { tooltip: vTooltip } }, attachTo: document.body },
  )
}

const activeTip = () => [...document.body.querySelectorAll('div')].find(d => d.style.position === 'fixed')

describe('v-tooltip directive', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  test('shows the tooltip on hover and removes it on leave', async () => {
    const wrapper = mountWithTooltip('<button v-tooltip="\'Roll the dice\'">roll</button>')

    await wrapper.find('button').trigger('mouseenter')
    expect(activeTip().textContent).toBe('Roll the dice')

    await wrapper.find('button').trigger('mouseleave')
    expect(activeTip()).toBeUndefined()
    wrapper.unmount()
  })

  test('clicking the element dismisses the tooltip', async () => {
    const wrapper = mountWithTooltip('<button v-tooltip="\'tip\'">x</button>')

    await wrapper.find('button').trigger('mouseenter')
    await wrapper.find('button').trigger('click')

    expect(activeTip()).toBeUndefined()
    wrapper.unmount()
  })

  test('only one tooltip exists at a time', async () => {
    const wrapper = mountWithTooltip(
      '<div><button id="a" v-tooltip="\'first\'">a</button><button id="b" v-tooltip="\'second\'">b</button></div>',
    )

    await wrapper.find('#a').trigger('mouseenter')
    await wrapper.find('#b').trigger('mouseenter')

    const tips = [...document.body.querySelectorAll('div')].filter(d => d.style.position === 'fixed')
    expect(tips).toHaveLength(1)
    expect(tips[0].textContent).toBe('second')
    wrapper.unmount()
  })

  test('an empty binding renders no tooltip', async () => {
    const wrapper = mountWithTooltip('<button v-tooltip="\'\'">x</button>')

    await wrapper.find('button').trigger('mouseenter')

    expect(activeTip()).toBeUndefined()
    wrapper.unmount()
  })

  test('unmounting cleans up an open tooltip', async () => {
    const wrapper = mountWithTooltip('<button v-tooltip="\'tip\'">x</button>')

    await wrapper.find('button').trigger('mouseenter')
    expect(activeTip()).toBeTruthy()

    wrapper.unmount()
    expect(activeTip()).toBeUndefined()
  })

  test('updated bindings replace the tooltip content', async () => {
    const wrapper = mount(
      {
        template: '<button v-tooltip="msg">x</button>',
        data: () => ({ msg: 'before' }),
      },
      { global: { directives: { tooltip: vTooltip } }, attachTo: document.body },
    )

    await wrapper.setData({ msg: 'after' })
    await wrapper.find('button').trigger('mouseenter')

    expect(activeTip().textContent).toBe('after')
    wrapper.unmount()
  })
})
