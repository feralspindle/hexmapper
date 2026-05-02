import { h } from 'vue'

const _die = (shapes) => ({
  props: ['size'],
  render() {
    return h('svg', {
      width: this.size ?? 20,
      height: this.size ?? 20,
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': 1.6,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
    }, shapes)
  },
})

export const DIE_ICONS = {
  d4:   _die([h('polygon', { points: '12,2 22,21 2,21' }), h('line', { x1: 7, y1: 15, x2: 17, y2: 15 })]),
  d6:   _die([h('rect', { x: 3, y: 3, width: 18, height: 18, rx: 2 })]),
  d8:   _die([h('polygon', { points: '12,2 22,12 12,22 2,12' }), h('line', { x1: 2, y1: 12, x2: 22, y2: 12 })]),
  d10:  _die([h('polygon', { points: '12,2 21,9 17,21 7,21 3,9' }), h('line', { x1: 3, y1: 9, x2: 21, y2: 9 })]),
  d12:  _die([h('polygon', { points: '12,2 21,8 18,20 6,20 3,8' })]),
  d20:  _die([h('polygon', { points: '12,2 22,20 2,20' }), h('polygon', { points: '7,13 17,13 12,20' })]),
  d100: _die([h('circle', { cx: 8, cy: 8, r: 4.5 }), h('circle', { cx: 16, cy: 16, r: 4.5 }), h('line', { x1: 4, y1: 20, x2: 20, y2: 4 })]),
}
