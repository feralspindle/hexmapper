import { expect, test } from '@playwright/test'
import {
  createCampaign,
  deviceContextOptions,
  joinCampaign,
  loginByEmail,
  prepareHexInteractions,
} from './support/app.js'
import { e2eAccounts, missingE2EAccountEnv, uniqueCampaignName } from './support/env.js'

const missingEnv = missingE2EAccountEnv()

async function newSoundProbeContext(browser, contextOptions = {}) {
  const context = await browser.newContext({ ...deviceContextOptions(), ...contextOptions })
  await context.addInitScript(() => {
    window.__soundProbe = 0
    const Ctx = window.AudioContext || window['webkitAudioContext']
    if (!Ctx) return
    const original = Ctx.prototype.createOscillator
    Ctx.prototype.createOscillator = function (...args) {
      window.__soundProbe += 1
      return original.apply(this, args)
    }
  })
  return context
}

test.describe.serial('cross-session isolation', () => {
  test.skip(
    missingEnv.length > 0,
    `Set seeded E2E account env vars to run isolation tests: ${missingEnv.join(', ')}`,
  )

  test('a client hears and sees nothing from another session its account is a member of', async ({ browser }) => {
    test.setTimeout(90_000)
    const accounts = e2eAccounts()

    const observerContext = await newSoundProbeContext(browser)
    const observerPage = await observerContext.newPage()

    const gm1Context = await browser.newContext(deviceContextOptions())
    const gm1Page = await gm1Context.newPage()

    const gm2Context = await browser.newContext(deviceContextOptions())
    const gm2Page = await gm2Context.newPage()

    const memberContext = await browser.newContext(deviceContextOptions())
    const memberPage = await memberContext.newPage()

    try {
      await loginByEmail(gm1Page, accounts.gm)
      const quietSessionId = await createCampaign(gm1Page, uniqueCampaignName('E2E Quiet'))
      await prepareHexInteractions(gm1Page)
      await joinCampaign(observerPage, accounts.player1, quietSessionId)

      await loginByEmail(gm2Page, accounts.gm)
      const busySessionId = await createCampaign(gm2Page, uniqueCampaignName('E2E Busy'))
      await prepareHexInteractions(gm2Page)
      await joinCampaign(memberPage, accounts.player1, busySessionId)

      await gm2Page.locator('[data-testid="dice-die"][data-die="d20"]').click()
      await gm2Page.getByTestId('dice-roll').click()
      await gm2Page.getByTestId('chat-input').fill('Noise from the busy session')
      await gm2Page.getByTestId('chat-send').click()

      await expect(memberPage.getByTestId('dice-roll-row')).toHaveCount(1)
      await expect(memberPage.getByTestId('chat-message')).toHaveCount(1)
      await observerPage.waitForTimeout(2000)

      await expect(observerPage.getByTestId('dice-roll-row')).toHaveCount(0)
      await expect(observerPage.getByTestId('chat-message')).toHaveCount(0)
      expect(await observerPage.evaluate(() => window.__soundProbe)).toBe(0)

      await observerPage.locator('[data-testid="dice-die"][data-die="d6"]').click()
      await observerPage.getByTestId('dice-roll').click()
      await expect(observerPage.getByTestId('dice-roll-row')).toHaveCount(1)
      await expect
        .poll(() => observerPage.evaluate(() => window.__soundProbe))
        .toBeGreaterThan(0)
    } finally {
      await Promise.all([
        observerContext.close(),
        gm1Context.close(),
        gm2Context.close(),
        memberContext.close(),
      ])
    }
  })
})
