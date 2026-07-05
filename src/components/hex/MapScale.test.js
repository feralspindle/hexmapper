import { describe, test, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import MapScale from './MapScale.vue'

describe('MapScale', () => {
  test('renders nothing when the map has no scale set', () => {
    const wrapper = mount(MapScale, { props: { scale: null } })
    expect(wrapper.find('.map-scale-overlay').exists()).toBe(false)
  })

  test('shows the scale in miles by default', () => {
    const wrapper = mount(MapScale, { props: { scale: 12 } })
    expect(wrapper.text()).toContain('0')
    expect(wrapper.text()).toContain('12 mi')
  })

  test('feet display as ft', () => {
    const wrapper = mount(MapScale, { props: { scale: 50, unit: 'feet' } })
    expect(wrapper.text()).toContain('50 ft')
  })
})
