import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import {
  createThreeRoleCampaign,
  importCharacterJson,
  openCharacterSheet,
  openCharacterSheetTab,
} from './support/app.js'
import { e2eAccounts, missingE2EAccountEnv, uniqueCampaignName } from './support/env.js'

const missingEnv = missingE2EAccountEnv()

const sampleCharacterJson = readFileSync(
  fileURLToPath(new URL('../sample_character.json', import.meta.url)),
  'utf8',
)

const contextOptions = { viewport: { width: 1920, height: 1080 } }

test.describe.serial('character sheet', () => {
  test.skip(
    missingEnv.length > 0,
    `Set seeded E2E account env vars to run character sheet tests: ${missingEnv.join(', ')}`,
  )

  test('import, HP / temp HP / renown adjustments, and gear reach the GM', async ({ browser }) => {
    const room = await createThreeRoleCampaign(browser, e2eAccounts(), {
      mode: 'fow',
      name: uniqueCampaignName('E2E Character'),
      contextOptions,
    })

    try {
      await importCharacterJson(room.player1.page, sampleCharacterJson, 'Shazkhag')
      await openCharacterSheet(room.player1.page)
      await expect(room.player1.page.getByTestId('char-name')).toHaveText('Shazkhag')
      await expect(room.player1.page.getByTestId('hp-value')).toHaveText('3')

      await room.player1.page.getByTestId('hp-minus').click()
      await expect(room.player1.page.getByTestId('hp-value')).toHaveText('2')

      await room.player1.page.getByTestId('temp-hp-plus').click()
      await room.player1.page.getByTestId('temp-hp-plus').click()
      await expect(room.player1.page.getByTestId('temp-hp-value')).toHaveText('2')

      const renownBefore = Number(
        await room.player1.page.getByTestId('renown-value').innerText(),
      )
      await room.player1.page.getByTestId('renown-plus').click()
      const renownAfter = String(renownBefore + 1)
      await expect(room.player1.page.getByTestId('renown-value')).toHaveText(renownAfter)

      await openCharacterSheetTab(room.player1.page, 'gear')
      const gearBefore = await room.player1.page.getByTestId('gear-item').count()
      await room.player1.page.getByTestId('gear-add').click()
      await room.player1.page.getByTestId('gear-name-input').fill('E2E Lantern')
      await room.player1.page.getByTestId('gear-submit').click()
      await expect(room.player1.page.getByTestId('gear-item')).toHaveCount(gearBefore + 1)
      await expect(
        room.player1.page.getByTestId('gear-item').filter({ hasText: 'E2E Lantern' }),
      ).toHaveCount(1)

      await openCharacterSheet(room.gm.page)
      await room.gm.page.getByTestId('char-picker-toggle').click()
      await room.gm.page.locator('.cp-row', { hasText: 'Shazkhag' }).click()
      await expect(room.gm.page.getByTestId('char-name')).toHaveText('Shazkhag')
      await expect(room.gm.page.getByTestId('hp-value')).toHaveText('2')
      await expect(room.gm.page.getByTestId('temp-hp-value')).toHaveText('2')
      await expect(room.gm.page.getByTestId('renown-value')).toHaveText(renownAfter)

      await openCharacterSheetTab(room.gm.page, 'gear')
      await expect(
        room.gm.page.getByTestId('gear-item').filter({ hasText: 'E2E Lantern' }),
      ).toHaveCount(1)
    } finally {
      await room.close()
    }
  })
})
