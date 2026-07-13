import { expect, test } from '@playwright/test'
import {
  createThreeRoleCampaign,
  createCharacter,
  openCharacterSheetTab,
  openNotebook,
} from './support/app.js'
import { e2eAccounts, missingE2EAccountEnv, uniqueCampaignName } from './support/env.js'

const missingEnv = missingE2EAccountEnv()

const contextOptions = { viewport: { width: 1920, height: 1080 } }

async function addItemLoot(page, name, quantity = 1) {
  await page.getByTestId('vault-add-loot').click()
  await page.getByTestId('vault-loot-type-item').click()
  await page.getByTestId('vault-loot-name').fill(name)
  await page.getByTestId('vault-loot-qty').fill(String(quantity))
  await page.getByTestId('vault-loot-submit').click()
}

async function addContainer(page, name) {
  await page.getByTestId('vault-add-container').click()
  await page.getByTestId('vault-container-name').fill(name)
  await page.getByTestId('vault-container-submit').click()
}

function storedItems(page, name) {
  return page.getByTestId('vault-stored-item').filter({ hasText: name })
}

function activityEntries(page) {
  return page.getByTestId('vault-activity-entry')
}

test.describe.serial('vault transfers and activity log', () => {
  test.skip(
    missingEnv.length > 0,
    `Set seeded E2E account env vars to run vault tests: ${missingEnv.join(', ')}`,
  )

  test('items move between storage and gear slots, and every move lands in the activity log', async ({ browser }) => {
    test.setTimeout(120_000)
    const room = await createThreeRoleCampaign(browser, e2eAccounts(), {
      mode: 'fow',
      name: uniqueCampaignName('E2E Vault Transfers'),
      contextOptions,
    })

    try {
      await createCharacter(room.player1.page, 'Pyx')

      await openNotebook(room.gm.page, 'vault')
      await openNotebook(room.player1.page, 'vault')

      await addContainer(room.gm.page, 'Donkey Cart')
      await expect(room.player1.page.locator('.pv-container-name', { hasText: 'Donkey Cart' })).toBeVisible()

      // loot -> container, visible to the other client
      await addItemLoot(room.player1.page, 'Hemp Rope', 3)
      const ropeCard = room.player1.page.getByTestId('vault-loot-card').filter({ hasText: 'Hemp Rope' })
      await ropeCard.getByRole('button', { name: 'Store' }).click()
      await expect(storedItems(room.player1.page, 'Hemp Rope')).toHaveCount(1)
      await expect(storedItems(room.gm.page, 'Hemp Rope')).toHaveCount(1)

      // the GM has no character, so Take is disabled for them
      await expect(storedItems(room.gm.page, 'Hemp Rope').getByTestId('vault-item-take')).toBeDisabled()

      // container -> player gear, partial stack
      await storedItems(room.player1.page, 'Hemp Rope').getByTestId('vault-item-take').click()
      await room.player1.page.getByTestId('vault-take-qty').fill('1')
      await room.player1.page.getByTestId('vault-take-confirm').click()
      await expect(storedItems(room.player1.page, 'Hemp Rope')).toContainText('×2')
      await expect(storedItems(room.gm.page, 'Hemp Rope')).toContainText('×2')

      await openCharacterSheetTab(room.player1.page, 'gear')
      const ropeGear = room.player1.page.getByTestId('gear-item').filter({ hasText: 'Hemp Rope' })
      await expect(ropeGear).toHaveCount(1)

      // gear -> container, from the character sheet
      await ropeGear.getByTestId('gear-stash').click()
      await ropeGear.getByTestId('gear-stash-option').filter({ hasText: 'Donkey Cart' }).click()
      await expect(ropeGear).toHaveCount(0)
      await expect(storedItems(room.gm.page, 'Hemp Rope')).toHaveCount(2)

      // container -> container needs a second container
      await addContainer(room.gm.page, 'Pack Mule')
      await storedItems(room.gm.page, 'Hemp Rope')
        .first()
        .getByTestId('vault-item-move')
        .click()
      await room.gm.page.getByTestId('vault-move-option').filter({ hasText: 'Pack Mule' }).click()

      // every transfer above is in the log, on a client that didn't perform it
      const gmFeed = activityEntries(room.gm.page)
      await expect(gmFeed.filter({ hasText: 'stored Hemp Rope ×3 in Donkey Cart' })).toHaveCount(1)
      await expect(gmFeed.filter({ hasText: 'took Hemp Rope from Donkey Cart' })).toHaveCount(1)
      await expect(gmFeed.filter({ hasText: 'stored Hemp Rope in Donkey Cart' })).toHaveCount(1)
      await expect(gmFeed.filter({ hasText: 'moved Hemp Rope' })).toHaveCount(1)
      const playerFeed = activityEntries(room.player1.page)
      await expect(playerFeed.filter({ hasText: 'took Hemp Rope from Donkey Cart' })).toHaveCount(1)
      await expect(playerFeed.filter({ hasText: 'took Hemp Rope' }).first()).toContainText('Pyx')
    } finally {
      await room.close()
    }
  })
})
