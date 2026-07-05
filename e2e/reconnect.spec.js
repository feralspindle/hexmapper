import { expect, test } from '@playwright/test'
import { createThreeRoleCampaign, hexCell, prepareHexInteractions } from './support/app.js'
import { e2eAccounts, missingE2EAccountEnv, uniqueCampaignName } from './support/env.js'

const missingEnv = missingE2EAccountEnv()

test.describe.serial('realtime reconnect convergence', () => {
  test.skip(
    missingEnv.length > 0,
    `Set seeded E2E account env vars to run reconnect tests: ${missingEnv.join(', ')}`,
  )

  test('a player who drops offline converges after reconnect without a page teardown', async ({ browser }) => {
    test.setTimeout(150_000)
    const room = await createThreeRoleCampaign(browser, e2eAccounts(), {
      mode: 'fow',
      name: uniqueCampaignName('E2E Reconnect'),
    })

    try {
      await prepareHexInteractions(room.gm.page)
      await expect(hexCell(room.player1.page, 0, 0)).toHaveAttribute('data-visible-to-player', 'false')

      await room.player1.page.evaluate(() => {
        document.querySelector('[data-testid="hex-grid"]').dataset.e2eReconnectProbe = 'kept'
      })

      await room.player1.context.setOffline(true)
      await expect(room.player1.page.getByTestId('realtime-banner')).toBeVisible({ timeout: 60_000 })

      await room.gm.page.getByTestId('hex-tool-reveal').click()
      await hexCell(room.gm.page, 0, 0).click()
      await expect(hexCell(room.player2.page, 0, 0)).toHaveAttribute('data-visible-to-player', 'true')
      await expect(hexCell(room.player1.page, 0, 0)).toHaveAttribute('data-visible-to-player', 'false')

      await room.player1.context.setOffline(false)

      await expect(hexCell(room.player1.page, 0, 0)).toHaveAttribute('data-visible-to-player', 'true', {
        timeout: 60_000,
      })
      await expect(room.player1.page.getByTestId('realtime-banner')).toHaveCount(0, { timeout: 30_000 })

      const probe = await room.player1.page.evaluate(
        () => document.querySelector('[data-testid="hex-grid"]')?.dataset.e2eReconnectProbe ?? 'remounted',
      )
      expect(probe).toBe('kept')
    } finally {
      await room.close()
    }
  })
})
