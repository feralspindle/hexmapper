import { expect, test } from '@playwright/test'
import { createThreeRoleCampaign, openOracle } from './support/app.js'
import { e2eAccounts, missingE2EAccountEnv, uniqueCampaignName } from './support/env.js'

const missingEnv = missingE2EAccountEnv()

test.describe.serial('oracle multiplayer sync', () => {
  test.skip(
    missingEnv.length > 0,
    `Set seeded E2E account env vars to run oracle tests: ${missingEnv.join(', ')}`,
  )

  test('GM oracle rolls appear for both players', async ({ browser }) => {
    const room = await createThreeRoleCampaign(browser, e2eAccounts(), {
      mode: 'gm_less',
      name: uniqueCampaignName('E2E Oracle GM'),
    })

    try {
      await openOracle(room.gm.page)
      await room.gm.page.getByTestId('oracle-question').fill('Is the bridge guarded?')
      await room.gm.page.getByTestId('oracle-roll-yes-no').click()

      await openOracle(room.player1.page)
      await openOracle(room.player2.page)

      await expect(room.player1.page.getByTestId('oracle-roll-history').first()).toContainText('Is the bridge guarded?')
      await expect(room.player2.page.getByTestId('oracle-roll-history').first()).toContainText('Is the bridge guarded?')
    } finally {
      await room.close()
    }
  })

  test('player-created table rolls appear for GM and other players', async ({ browser }) => {
    const room = await createThreeRoleCampaign(browser, e2eAccounts(), {
      mode: 'gm_less',
      name: uniqueCampaignName('E2E Oracle Table'),
    })

    try {
      await openOracle(room.player1.page)
      await room.player1.page.getByTestId('oracle-table-new').click()
      await expect(room.player1.page.getByTestId('oracle-table').first()).toBeVisible()
      await room.player1.page.getByTestId('oracle-roll-table').first().click()

      await openOracle(room.gm.page)
      await openOracle(room.player2.page)

      await expect(room.gm.page.getByTestId('oracle-roll-history').first()).toContainText('First result')
      await expect(room.player2.page.getByTestId('oracle-roll-history').first()).toContainText('First result')
    } finally {
      await room.close()
    }
  })
})
