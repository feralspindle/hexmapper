<template>
  <div v-if="imageUrl" class="ms-preview">
    <img :src="imageUrl" alt="Map image" />
  </div>
  <div v-else class="ms-preview-empty">No image uploaded</div>

  <label class="ms-upload-btn">
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/>
    </svg>
    {{ hasImage ? 'Replace image' : 'Upload map image' }}
    <input type="file" accept="image/jpeg,image/png,image/webp" style="display:none" @change="onChange" />
  </label>

  <p v-if="error" class="ms-error">{{ error }}</p>
  <p v-if="uploading" class="ms-hint">
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" style="animation:ms-spin 1s linear infinite;display:inline-block">
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
    </svg>
    Uploading…
  </p>
  <p v-else class="ms-hint">{{ hint }}</p>
</template>

<script setup>
defineProps({
  imageUrl: { type: String, default: null },
  hasImage: { type: Boolean, default: false },
  uploading: { type: Boolean, default: false },
  error: { type: String, default: '' },
  hint: { type: String, default: 'JPEG, PNG, or WebP · max 50 MB' },
})
const emit = defineEmits(['file'])

function onChange(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (file) emit('file', file)
}
</script>

<style scoped>
@keyframes ms-spin { to { transform: rotate(360deg); } }

.ms-preview {
  border: 1px solid var(--rule-strong, rgba(58,46,34,.3));
  border-radius: 2px;
  overflow: hidden;
  margin-bottom: 8px;
}
.ms-preview img {
  display: block;
  width: 100%;
  height: 80px;
  object-fit: cover;
}
.ms-preview-empty {
  height: 52px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px dashed var(--rule-strong, rgba(58,46,34,.3));
  border-radius: 2px;
  margin-bottom: 8px;
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--ink-mute);
  letter-spacing: .04em;
}

.ms-upload-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  padding: 6px 10px;
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: .04em;
  color: var(--ink-2);
  background: var(--paper-2);
  border: 1px solid var(--rule-strong);
  border-radius: 2px;
  cursor: pointer;
  transition: background .15s, color .15s;
}
.ms-upload-btn:hover { background: var(--paper-3); color: var(--ink); }

.ms-hint {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--ink-mute);
  margin-top: 4px;
  line-height: 1.4;
  display: flex;
  align-items: center;
  gap: 5px;
}

.ms-error {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--accent);
  margin-top: 4px;
}
</style>
