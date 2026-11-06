import { expect, test } from '@playwright/test'
import { loginByEmail } from './support/app.js'
import { missingE2EAccountEnv } from './support/env.js'
import { MOCK_USER, mockBackend } from './support/mockBackend.js'

const SESSION_ID = '00000000-0000-4000-8000-0000000000aa'
const DUNGEON_ID = '00000000-0000-4000-8000-0000000000bb'
const HEX_PATH = `/session/${SESSION_ID}`
const DUNGEON_PATH = `${HEX_PATH}/dungeon/${DUNGEON_ID}`
const PIXEL = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAEAQH/7yMK/gAAAABJRU5ErkJggg=='

// playwright.config.js only starts a dev server when the seeded accounts are
// set. this spec needs neither accounts nor a backend, so without them it serves
// the app itself instead of skipping
const SELF_HOST_PORT = 5199
const selfHost = !process.env.E2E_BASE_URL && missingE2EAccountEnv().length > 0

test.use({
  viewport: { width: 1920, height: 1080 },
  ...(selfHost ? { baseURL: `http://127.0.0.1:${SELF_HOST_PORT}` } : {}),
})

let viteServer = null

test.beforeAll(async () => {
  if (!selfHost) return
  process.env.VITE_SUPABASE_URL = 'http://supabase.invalid'
  process.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY = 'mock-anon-key'
  process.env.VITE_API_BASE_URL = 'http://api.invalid/api'
  const { createServer } = await import('vite')
  viteServer = await createServer({
    logLevel: 'silent',
    server: { host: '127.0.0.1', port: SELF_HOST_PORT, strictPort: true },
  })
  await viteServer.listen()
})

test.afterAll(async () => {
  await viteServer?.close()
})

async function panelBackground(panel) {
  return panel.evaluate((el) => {
    const root = document.querySelector('.dungeon-scribe')
    const probe = document.createElement('div')
    probe.style.background = 'var(--paper)'
    root.append(probe)
    const paper = getComputedStyle(probe).backgroundColor
    probe.remove()
    return { actual: getComputedStyle(el).backgroundColor, paper }
  })
}

function alpha(color) {
  const channels = color.match(/[\d.]+/g).map(Number)
  return channels.length === 4 ? channels[3] : 1
}

async function expectOpaquePaper(panel) {
  await expect(panel).toBeVisible()
  const { actual, paper } = await panelBackground(panel)
  expect(alpha(actual), `background-color was ${actual}`).toBe(1)
  expect(actual).toBe(paper)
}

async function signIn(page, baseURL, { tables } = {}) {
  await mockBackend(page, { appUrl: baseURL, sessionId: SESSION_ID, tables })
  await loginByEmail(page, { email: MOCK_USER.email, password: 'mock-password' })
}

async function visit(page, path) {
  await page.goto(path)
  await expect(page.locator('.dungeon-scribe')).toBeVisible()
}

test.describe('teleported panels keep the paper theme', () => {
  for (const [surface, path] of [['hex', HEX_PATH], ['dungeon', DUNGEON_PATH]]) {
    test(`new character modal is opaque on the ${surface} view`, async ({ page, baseURL }) => {
      await signIn(page, baseURL)
      await visit(page, path)

      await page.getByTestId('char-picker-toggle').click()
      await page.getByTestId('char-picker-new').click()

      const panel = page.getByTestId('new-char-panel')
      await expectOpaquePaper(panel)
      await expect(page.getByTestId('new-char-name')).toBeFocused()

      const inputBg = await page.getByTestId('new-char-name').evaluate((el) => getComputedStyle(el).backgroundColor)
      expect(alpha(inputBg), `input background-color was ${inputBg}`).toBe(1)
    })
  }

  test('photo broadcast modal is opaque', async ({ page, baseURL }) => {
    await signIn(page, baseURL)
    await visit(page, HEX_PATH)

    await page.evaluate((src) => {
      const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia
      pinia._s.get('photo').currentBroadcast = { id: 'mock', photo_name: 'Relic', photo_url: src }
    }, `data:image/png;base64,${PIXEL}`)

    await expectOpaquePaper(page.getByTestId('photo-broadcast-panel'))
  })

  test('enlarged revealed photo is opaque', async ({ page, baseURL }) => {
    await signIn(page, baseURL, {
      tables: {
        photo_broadcasts: [
          { id: 'mock', photo_url: 'mock.png', photo_name: 'Relic', created_at: '2026-01-01T00:00:00Z' },
        ],
      },
    })
    await visit(page, HEX_PATH)

    await page.getByRole('button', { name: 'Inspect & Photos' }).click()
    await page.locator('.dps-card-btn').first().click()

    await expectOpaquePaper(page.getByTestId('photo-enlarged-panel'))
  })
})
