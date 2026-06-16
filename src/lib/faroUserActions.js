const INTERACTIVE_SELECTOR = [
  '[data-faro-user-action-name]',
  'button',
  'a[href]',
  '[role="button"]',
  '[role="menuitem"]',
  '[role="menuitemcheckbox"]',
  '[role="menuitemradio"]',
  '[role="tab"]',
  '[role="switch"]',
  '[role="checkbox"]',
  '[role="radio"]',
  '[role="option"]',
  '[role="link"]',
  'input',
  'select',
  'textarea',
  'label',
  'summary',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

const MAX_NAME_LEN = 24

function sanitizeText(raw) {
  if (!raw) return ''
  return raw
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\d/g, '#')
    .slice(0, MAX_NAME_LEN)
}

function isEditableTarget(el) {
  if (!el) return false
  if (el.isContentEditable) return true
  const tag = el.tagName
  if (tag === 'TEXTAREA') return true
  if (tag === 'INPUT') {
    const type = (el.getAttribute('type') || 'text').toLowerCase()
    return !['button', 'submit', 'reset', 'checkbox', 'radio'].includes(type)
  }
  return false
}

function deriveName(target) {
  const explicit = target.closest('[data-faro-user-action-name]')
  if (explicit) return explicit.dataset.faroUserActionName

  const el = target.closest(INTERACTIVE_SELECTOR) || target

  const ariaLabel = el.getAttribute?.('aria-label')
  if (ariaLabel) return sanitizeText(ariaLabel)

  const title = el.getAttribute?.('title')
  if (title) return sanitizeText(title)

  const tag = el.tagName?.toLowerCase() || 'unknown'

  if (tag === 'input' || tag === 'select' || tag === 'textarea') {
    const type = el.getAttribute?.('type') || tag
    const name = el.getAttribute?.('name')
    return name ? `${tag}:${name}` : `${tag}:${type}`
  }

  const testId = el.getAttribute?.('data-testid')
  if (testId) return testId

  const id = el.getAttribute?.('id')
  if (id) return `${tag}#${id}`

  const text = sanitizeText(el.textContent)
  if (text) return text

  const role = el.getAttribute?.('role')
  return role ? `${tag}[${role}]` : tag
}

export function installAutoUserActions(faro) {
  const api = faro?.api
  if (!api?.startUserAction) return

  function handle(event) {
    const target = event.target
    if (!target || typeof target.closest !== 'function') return

    // Faro's built-in instrumentation already starts an action when the exact
    // event target carries the data attribute — defer to it to avoid the
    // "action already running" error from a double start.
    if (target.dataset?.faroUserActionName) return

    // Only one user action can be active at a time; starting a second throws an
    // internal error and is dropped, so skip while one is in flight.
    if (api.getActiveUserAction?.()) return

    const name = deriveName(target)
    if (!name) return
    api.startUserAction(name, {}, { triggerName: event.type })
  }

  window.addEventListener('pointerdown', handle, { capture: true })
  window.addEventListener(
    'keydown',
    (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return
      if (isEditableTarget(event.target)) return
      handle(event)
    },
    { capture: true },
  )
}
