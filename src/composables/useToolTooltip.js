import { reactive } from 'vue'

// floating tooltip for .ds-tool rails: reads the hidden .ds-tip inside the
// hovered button and portals it to the body so it isn't clipped by the rail
export function useToolTooltip() {
  const tip = reactive({ show: false, x: 0, y: 0, html: '' })
  let _lastBtn = null

  function onHover(e) {
    const btn = e.target.closest('.ds-tool')
    if (btn === _lastBtn) return
    _lastBtn = btn
    if (!btn) { tip.show = false; return }
    const tipEl = btn.querySelector('.ds-tip')
    if (!tipEl) { tip.show = false; return }
    const rect = btn.getBoundingClientRect()
    tip.x = rect.right + 10
    tip.y = rect.top + rect.height / 2
    tip.html = tipEl.innerHTML
    tip.show = true
  }

  function onLeave() {
    _lastBtn = null
    tip.show = false
  }

  return { tip, onHover, onLeave }
}
