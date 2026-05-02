let active = null

function remove() {
  if (active) { active.remove(); active = null }
}

function show(el) {
  remove()
  const content = el._tipContent
  if (!content) return

  const tip = document.createElement('div')
  tip.textContent = content
  Object.assign(tip.style, {
    position:        'fixed',
    zIndex:          '99999',
    backgroundColor: '#1c1917',
    color:           '#e8d5a3',
    border:          '1px solid #57534e',
    borderRadius:    '4px',
    padding:         '4px 8px',
    fontFamily:      '"JetBrains Mono", ui-monospace, monospace',
    fontSize:        '12px',
    lineHeight:      '1.5',
    maxWidth:        '220px',
    whiteSpace:      'normal',
    pointerEvents:   'none',
    boxShadow:       '0 2px 8px rgba(0,0,0,0.6)',
  })
  document.body.appendChild(tip)
  active = tip

  const r   = el.getBoundingClientRect()
  const tr  = tip.getBoundingClientRect()
  const gap = 6
  const placement = el._tipPlacement ?? 'top'

  let top, left
  if (placement === 'bottom') {
    top  = r.bottom + gap
    left = r.left + r.width / 2 - tr.width / 2
  } else if (placement === 'left') {
    top  = r.top + r.height / 2 - tr.height / 2
    left = r.left - tr.width - gap
  } else if (placement === 'right') {
    top  = r.top + r.height / 2 - tr.height / 2
    left = r.right + gap
  } else {
    top  = r.top - tr.height - gap
    left = r.left + r.width / 2 - tr.width / 2
  }

  tip.style.top  = Math.max(8, Math.min(top,  window.innerHeight - tr.height - 8)) + 'px'
  tip.style.left = Math.max(8, Math.min(left, window.innerWidth  - tr.width  - 8)) + 'px'
}

function bind(el, binding) {
  el._tipContent   = typeof binding.value === 'object' ? binding.value?.content : binding.value
  el._tipPlacement = Object.keys(binding.modifiers)[0] ?? binding.value?.placement ?? 'top'
  el._tipShow = () => show(el)
  el._tipHide = remove
  el.addEventListener('mouseenter', el._tipShow)
  el.addEventListener('mouseleave', el._tipHide)
  el.addEventListener('click',      el._tipHide)
}

export const vTooltip = {
  mounted:   bind,
  updated(el, binding) {
    el._tipContent   = typeof binding.value === 'object' ? binding.value?.content : binding.value
    el._tipPlacement = Object.keys(binding.modifiers)[0] ?? binding.value?.placement ?? 'top'
  },
  unmounted(el) {
    el.removeEventListener('mouseenter', el._tipShow)
    el.removeEventListener('mouseleave', el._tipHide)
    el.removeEventListener('click',      el._tipHide)
    remove()
  },
}
