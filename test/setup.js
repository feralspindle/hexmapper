import { config } from '@vue/test-utils'

config.global.directives = {
  tooltip: {},
}

if (!globalThis.crypto?.randomUUID) {
  let counter = 0
  globalThis.crypto = {
    ...globalThis.crypto,
    randomUUID: () => `00000000-0000-4000-8000-${String(++counter).padStart(12, '0')}`,
  }
}

if (!globalThis.localStorage) {
  const store = new Map()
  globalThis.localStorage = {
    getItem: key => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: key => store.delete(key),
    clear: () => store.clear(),
    key: index => [...store.keys()][index] ?? null,
    get length() {
      return store.size
    },
  }
}
