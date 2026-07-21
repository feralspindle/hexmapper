export const HEX_MAP_THEME = {
  '--paper':       '#1c1917',
  '--paper-2':     '#292524',
  '--paper-3':     '#3c3835',
  '--paper-edge':  '#57534e',
  '--ink':         '#f5f5f4',
  '--ink-2':       '#d6d3d1',
  '--ink-soft':    '#d6d3d1',
  '--ink-mute':    '#a8a29e',
  '--rule':        'rgba(255,255,255,.08)',
  '--rule-strong': 'rgba(255,255,255,.18)',
  '--accent':      '#dca85a',
  '--accent-2':    '#e8c488',
  '--accent-3':    '#86efac',
  '--danger-text': '#fca5a5',
  '--warning-text':'#fcd34d',
  '--warning-hover':'#fde68a',
  '--font-body':   'ui-sans-serif, system-ui, sans-serif',
  '--font-zine':   'ui-monospace, monospace',
  '--font-mono':   'ui-monospace, monospace',
  '--font-ui':     'ui-sans-serif, system-ui, sans-serif',
}

const CANVAS_THEMES = {
  parchment: {
    colors: { bg: '--canvas-parchment-bg', grid: '--canvas-parchment-grid', gridStrong: '--canvas-parchment-grid-strong', floor: '--canvas-parchment-floor', wall: '--canvas-parchment-wall', selectedColor: '--accent' },
    wallW: 2,
    name: { family: '"IM Fell English",serif', size: 14, color: '--canvas-parchment-label', italic: true, weight: '400', uppercase: false, letterSpacing: '.01em' },
    dims: { family: '"JetBrains Mono",monospace', color: '--canvas-parchment-meta', letterSpacing: '.06em' },
  },
  blueprint: {
    colors: { bg: '--canvas-blueprint-bg', grid: '--canvas-blueprint-grid', gridStrong: '--canvas-blueprint-grid-strong', floor: '--canvas-blueprint-floor', wall: '--canvas-blueprint-wall', selectedColor: '--accent-2' },
    wallW: 1.5,
    name: { family: '"JetBrains Mono",monospace', size: 11, color: '--canvas-blueprint-label', italic: false, weight: '600', uppercase: true, letterSpacing: '.12em' },
    dims: { family: '"JetBrains Mono",monospace', color: '--canvas-blueprint-meta', letterSpacing: '.08em' },
  },
  classic: {
    colors: { bg: '--canvas-classic-bg', grid: '--canvas-classic-grid', gridStrong: '--canvas-classic-grid-strong', floor: '--canvas-classic-floor', wall: '--canvas-classic-wall', selectedColor: '--accent' },
    wallW: 2.5,
    name: { family: '"Special Elite",monospace', size: 12, color: '--canvas-classic-label', italic: false, weight: '400', uppercase: true, letterSpacing: '.04em' },
    dims: { family: '"JetBrains Mono",monospace', color: '--canvas-classic-meta', letterSpacing: '.04em' },
  },
}

function cssToken(name) {
  if (typeof document === 'undefined') return name
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || name
}

export function canvasTheme(name) {
  const theme = CANVAS_THEMES[name] ?? CANVAS_THEMES.classic
  return {
    colors: Object.fromEntries(Object.entries(theme.colors).map(([role, token]) => [role, cssToken(token)])),
    wallW: theme.wallW,
    name: { ...theme.name, fill: cssToken(theme.name.color) },
    dims: { ...theme.dims, fill: cssToken(theme.dims.color) },
  }
}
