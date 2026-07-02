import { defineConfig, devices } from '@playwright/test'

const externalBaseUrl = process.env.E2E_BASE_URL
const baseURL = externalBaseUrl ?? 'http://127.0.0.1:5173'
const hasE2EAccounts = [
  'E2E_GM_EMAIL',
  'E2E_GM_PASSWORD',
  'E2E_PLAYER1_EMAIL',
  'E2E_PLAYER1_PASSWORD',
  'E2E_PLAYER2_EMAIL',
  'E2E_PLAYER2_PASSWORD',
].every((name) => !!process.env[name])

export default defineConfig({
  testDir: './e2e',
  timeout: 45_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 10_000,
    navigationTimeout: 20_000,
  },
  webServer: externalBaseUrl || !hasE2EAccounts
    ? undefined
    : {
        command: 'npm run dev -- --host 127.0.0.1',
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 90_000,
      },
  projects: [
    {
      name: 'chromium-multiplayer',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
