export function mapBootstrapAction({ mapsLoaded, mapsCount, activeMapId, isGM }) {
  if (!mapsLoaded) return 'blocked'
  if (mapsCount === 0 && activeMapId) return 'blocked'
  if (!isGM) return activeMapId ? 'init' : 'wait'
  if (mapsCount === 0) return 'create'
  if (!activeMapId) return 'adopt_first'
  return 'init'
}
