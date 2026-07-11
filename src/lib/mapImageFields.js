// camelCase patch key -> db column for the map-image settings the shared
// mapSettings controls write. kept in one place so the hex map and dungeon
// agree on the column names.
export const MAP_IMAGE_FIELD_MAP = {
  mapImagePath:     'map_image_path',
  mapImageOffsetX:  'map_image_offset_x',
  mapImageOffsetY:  'map_image_offset_y',
  mapImageScale:    'map_image_scale',
  mapImageRotation: 'map_image_rotation',
  mapOffsetLocked:  'map_offset_locked',
}

// copies present (defined) patch keys into dbPatch under their column names.
export function assignDbFields(dbPatch, patch, fieldMap) {
  for (const [key, column] of Object.entries(fieldMap)) {
    if (patch[key] !== undefined) dbPatch[column] = patch[key]
  }
  return dbPatch
}
