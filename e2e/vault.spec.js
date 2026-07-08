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

async function addCoinsLoot(page, quantity) {
  await page.getByTestId('vault-add-loot').click()
  await page.getByTestId('vault-loot-type-coins').click()
  await page.getByTestId('vault-loot-currency').selectOption('gold')
  await page.getByTestId('vault-loot-qty').fill(String(quantity))
  await page.getByTestId('vault-loot-submit').click()
}

async function addItemLoot(page, name, quantity = 1) {
  await page.getByTestId('vault-add-loot').click()
  await page.getByTestId('vault-loot-type-item').click()
  await page.getByTestId('vault-loot-name').fill(name)
  await page.getByTestId('vault-loot-qty').fill(String(quantity))
  await page.getByTestId('vault-loot-submit').click()
}

function lootCards(page) {
  return page.getByTestId('vault-loot-card')
}

test.describe.serial('party vault', () => {
  test.skip(
    missingEnv.length > 0,
    `Set seeded E2E account env vars to run vault tests: ${missingEnv.join(', ')}`,
  )

  test('deposit, split, assign, and claim keep totals consistent across clients', async ({ browser }) => {
    test.setTimeout(120_000)
    const room = await createThreeRoleCampaign(browser, e2eAccounts(), {
      mode: 'fow',
      name: uniqueCampaignName('E2E Vault'),
      contextOptions,
    })

    try {
      await createCharacter(room.player1.page, 'Pyx')
      await createCharacter(room.player2.page, 'Quill')

      await openNotebook(room.gm.page, 'vault')
      await openNotebook(room.player1.page, 'vault')
      await openNotebook(room.player2.page, 'vault')

      await addCoinsLoot(room.player1.page, 100)
      await expect(lootCards(room.player1.page)).toHaveCount(1)
      await expect(lootCards(room.gm.page)).toHaveCount(1)
      await expect(lootCards(room.player2.page)).toHaveCount(1)
      await expect(lootCards(room.gm.page).first()).toContainText('×100')

      await room.gm.page.getByTestId('vault-deposit').click()
      await expect(lootCards(room.gm.page)).toHaveCount(0)
      await expect(lootCards(room.player1.page)).toHaveCount(0)
      await expect(lootCards(room.player2.page)).toHaveCount(0)
      await expect(room.gm.page.getByTestId('vault-bank-gold')).toHaveText('100')
      await expect(room.player1.page.getByTestId('vault-bank-gold')).toHaveText('100')
      await expect(room.player2.page.getByTestId('vault-bank-gold')).toHaveText('100')

      await addCoinsLoot(room.player1.page, 50)
      await expect(lootCards(room.gm.page)).toHaveCount(1)
      await room.gm.page.getByTestId('vault-split').click()
      await room.gm.page.getByTestId('vault-split-confirm').click()
      await expect(lootCards(room.gm.page)).toHaveCount(0)
      await expect(lootCards(room.player1.page)).toHaveCount(0)
      await expect(lootCards(room.player2.page)).toHaveCount(0)

      await openCharacterSheetTab(room.player1.page, 'money')
      await expect(room.player1.page.getByTestId('coin-gold')).toContainText('25')
      await openCharacterSheetTab(room.player2.page, 'money')
      await expect(room.player2.page.getByTestId('coin-gold')).toContainText('25')

      await addItemLoot(room.player1.page, 'Sturdy Rope', 2)
      await expect(lootCards(room.gm.page)).toHaveCount(1)
      await room.gm.page.getByTestId('vault-assign').click()
      const quillBtn = room.gm.page.getByTestId('vault-assign-char').filter({ hasText: 'Quill' })
      await quillBtn.click()
      await quillBtn.click()
      await room.gm.page.getByTestId('vault-assign-confirm').click()
      await expect(lootCards(room.gm.page)).toHaveCount(0)
      await expect(lootCards(room.player1.page)).toHaveCount(0)
      await expect(lootCards(room.player2.page)).toHaveCount(0)

      await openCharacterSheetTab(room.player2.page, 'gear')
      await expect(
        room.player2.page.getByTestId('gear-item').filter({ hasText: 'Sturdy Rope' }),
      ).toHaveCount(1)

      await addItemLoot(room.player2.page, 'Signal Torch')
      const torchCard = lootCards(room.player1.page).filter({ hasText: 'Signal Torch' })
      await expect(torchCard).toHaveCount(1)
      await torchCard.getByTestId('vault-claim').click()
      await expect(lootCards(room.player1.page)).toHaveCount(0)
      await expect(lootCards(room.gm.page)).toHaveCount(0)

      await openCharacterSheetTab(room.player1.page, 'gear')
      await expect(
        room.player1.page.getByTestId('gear-item').filter({ hasText: 'Signal Torch' }),
      ).toHaveCount(1)

      await addItemLoot(room.player2.page, 'Iron Arrow', 3)
      const arrowCard = lootCards(room.player1.page).filter({ hasText: 'Iron Arrow' })
      await expect(arrowCard).toHaveCount(1)
      await arrowCard.getByTestId('vault-claim').click()
      await arrowCard.getByTestId('vault-claim-qty').fill('1')
      await arrowCard.getByTestId('vault-claim-confirm').click()
      await expect(arrowCard).toContainText('×2')
      await expect(lootCards(room.gm.page).filter({ hasText: 'Iron Arrow' })).toContainText('×2')
      await expect(
        room.player1.page.getByTestId('gear-item').filter({ hasText: 'Iron Arrow' }),
      ).toHaveCount(1)
    } finally {
      await room.close()
    }
  })
})
