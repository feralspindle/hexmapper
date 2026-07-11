import { supabase } from '@/lib/supabase'

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const EXT_BY_TYPE = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }

function decodeProbe(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload  = () => { URL.revokeObjectURL(url); resolve() }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('File could not be decoded as an image.')) }
    img.src = url
  })
}

// validates the file, proves it decodes, then uploads to the session-maps
// bucket under `${sessionId}/${prefix}${uuid}.ext`. maps and dungeons differ
// only by their size cap and path prefix.
export async function uploadSessionImage(file, { sessionId, maxBytes, prefix = '' }) {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) throw new Error('Only JPEG, PNG, and WebP images are allowed.')
  if (file.size > maxBytes) throw new Error(`Image must be under ${Math.round(maxBytes / (1024 * 1024))} MB.`)
  await decodeProbe(file)
  const path = `${sessionId}/${prefix}${crypto.randomUUID()}.${EXT_BY_TYPE[file.type]}`
  const { error } = await supabase.storage
    .from('session-maps')
    .upload(path, file, { contentType: file.type, upsert: false })
  if (error) throw new Error(error.message)
  return path
}
