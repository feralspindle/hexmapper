import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  // without this esbuild minifies media queries to range syntax
  // (@media (width<=900px)), which safari below 16.4 ignores outright -
  // every responsive breakpoint silently no-ops on older iphones/ipads
  build: {
    cssTarget: ['safari13', 'chrome87', 'firefox78'],
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./test/setup.js'],
    include: ['test/**/*.{test,spec}.js', 'src/**/*.{test,spec}.js'],
    env: {
      VITE_SUPABASE_URL: 'http://localhost:54321',
      VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY: 'test-anon-key',
      VITE_API_BASE_URL: 'http://localhost:8080/api',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      reportsDirectory: './coverage',
      include: ['src/**/*.{js,vue}'],
      exclude: [
        'src/main.js',
        'src/router/**',
        'src/assets/**',
        'src/**/*.d.ts',
      ],
    },
  },
})
