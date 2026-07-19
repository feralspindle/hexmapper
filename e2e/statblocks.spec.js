import { expect, test } from '@playwright/test'
import { createThreeRoleCampaign, openStatBlocks } from './support/app.js'
import { e2eAccounts, missingE2EAccountEnv, uniqueCampaignName } from './support/env.js'

const missingEnv = missingE2EAccountEnv()

test.describe.serial('npc and monster stat blocks', () => {
  test.skip(
    missingEnv.length > 0,
    `Set seeded E2E account env vars to run stat block tests: ${missingEnv.join(', ')}`,
  )

  test('a created monster syncs to every member and hp changes follow', async ({ browser }) => {
    const room = await createThreeRoleCampaign(browser, e2eAccounts(), {
      mode: 'gm_less',
      name: uniqueCampaignName('E2E Stat Blocks'),
    })

    try {
      await openStatBlocks(room.gm.page)
      await room.gm.page.getByTestId('statblock-add-name').fill('Goblin')
      await room.gm.page.getByTestId('statblock-add').click()
      await expect(room.gm.page.getByTestId('statblock-row').first()).toContainText('Goblin')

      await openStatBlocks(room.player1.page)
      await openStatBlocks(room.player2.page)
      await expect(room.player1.page.getByTestId('statblock-row').first()).toContainText('Goblin')
      await expect(room.player2.page.getByTestId('statblock-row').first()).toContainText('Goblin')

      await room.player1.page.getByTestId('statblock-hp-minus').first().click()
      await expect(room.player1.page.getByTestId('statblock-hp').first()).toHaveText('3/4')
      await expect(room.gm.page.getByTestId('statblock-hp').first()).toHaveText('3/4')
      await expect(room.player2.page.getByTestId('statblock-hp').first()).toHaveText('3/4')
    } finally {
      await room.close()
    }
  })
})
