import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import {
  createCharacter,
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

  test('attack modifiers stack with the linked stat and the roll uses the total', async ({ browser }) => {
    const room = await createThreeRoleCampaign(browser, e2eAccounts(), {
      mode: 'fow',
      name: uniqueCampaignName('E2E Attack Mods'),
      contextOptions,
    })

    try {
      const page = room.player1.page
      await importCharacterJson(page, sampleCharacterJson, 'Shazkhag')
      await openCharacterSheet(page)
      await page.getByTestId('char-tab-combat').click()

      const crossbow = page.locator('.cs-list-item').filter({ hasText: 'CROSSBOW' })
      await crossbow.getByTitle('Edit').click()

      // in edit mode the label becomes an input value, so the text filter no
      // longer matches - target the (single) open edit form instead
      const editForm = page.locator('.cs-list-item .cs-form-stack')

      // link STR (13 -> +1) and stack a talent +2, a debuff -1, and a long one
      await editForm.locator('select').selectOption('STR')
      await page.getByTestId('atk-mod-add').click()
      await page.getByTestId('atk-mod-label').last().fill('talent')
      await page.getByTestId('atk-mod-value').last().fill('2')
      await page.getByTestId('atk-mod-add').click()
      await page.getByTestId('atk-mod-label').last().fill('debuff')
      await page.getByTestId('atk-mod-value').last().fill('-1')
      await page.getByTestId('atk-mod-add').click()
      await page.getByTestId('atk-mod-label').last().fill('blessing of the war priest')
      await page.getByTestId('atk-mod-value').last().fill('1')
      const longDescription = 'Repeating heavy crossbow, 2H, skips move to reload, cold iron bolts, sighted against the eastern wind by a very picky dwarf'
      await editForm.getByTestId('atk-description').fill(longDescription)
      // the preview spells out what each source contributes
      await expect(editForm.locator('.cs-atk-mod-editor-total')).toContainText('roll +3 (STR +1 + modifiers +2)')
      await editForm.getByRole('button', { name: 'Save' }).click()

      // description sits above the chips, the chips carry the math
      const descEl = crossbow.locator('.cs-atk-desc')
      await expect(descEl).toHaveText(longDescription)
      // long descriptions wrap onto extra lines instead of clipping
      expect(await descEl.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true)
      expect(await descEl.evaluate(el => el.scrollHeight > 18)).toBe(true)
      const descBox = await descEl.boundingBox()
      const modsBox = await crossbow.locator('.cs-atk-mods').boundingBox()
      expect(descBox.y).toBeLessThan(modsBox.y)

      // +1 stat, +2 talent, -1 debuff, +1 blessing = +3
      await expect(crossbow).toContainText('STR +1')
      await expect(crossbow).toContainText('talent +2')
      await expect(crossbow).toContainText('debuff -1')
      await expect(crossbow.locator('.cs-atk-mod-total')).toHaveText('= +3')

      // chips wrap instead of pushing the action columns out of the sheet
      const sheetBox = await page.getByTestId('char-sheet').boundingBox()
      const editBox = await crossbow.getByTitle('Edit').boundingBox()
      expect(editBox.x + editBox.width).toBeLessThanOrEqual(sheetBox.x + sheetBox.width + 1)
      expect(editBox.x).toBeGreaterThanOrEqual(sheetBox.x - 1)

      // the attack roll carries the stacked total
      await crossbow.locator('.cs-list-main').first().click()
      await expect(page.getByTestId('dice-roll-row').first()).toContainText('1d20+3')

      // untouched attacks keep using the description bonus (+2 from "+2/+1")
      const dagger = page.locator('.cs-list-item').filter({ hasText: 'DAGGER' })
      await dagger.locator('.cs-list-main').first().click()
      await expect(page.getByTestId('dice-roll-row').first()).toContainText('DAGGER (OBSIDIAN)')
      await expect(page.getByTestId('dice-roll-row').first()).toContainText('1d20+2')
    } finally {
      await room.close()
    }
  })

  test('go to hell dims the party card with flames and a round tracker', async ({ browser }) => {
    const room = await createThreeRoleCampaign(browser, e2eAccounts(), {
      mode: 'fow',
      name: uniqueCampaignName('E2E Hell'),
      contextOptions,
    })

    try {
      const gm = room.gm.page
      const page = room.player1.page

      await createCharacter(page, 'Gunner')
      await openCharacterSheet(page)
      await page.getByTestId('char-tab-combat').click()

      // the amulet button opens a rounds picker defaulting to 3
      await page.getByTestId('go-to-hell').click()
      await expect(page.getByTestId('hell-rounds-count')).toHaveText('3')
      await page.getByTestId('hell-rounds-plus').click()
      await page.getByTestId('hell-descend').click()

      // own sheet tracks the sentence
      await expect(page.locator('.cs-hell-active')).toContainText('in hell · 4 rounds left')

      // the GM sees the dimmed card, flames, and the round stamp
      await gm.getByTestId('hex-party-toggle').click()
      const hellCard = gm.locator('.ds-player-card.in-hell')
      await expect(hellCard).toHaveCount(1)
      await expect(hellCard).toContainText('Gunner')
      await expect(hellCard).toContainText('hell · 4 rounds')
      await expect(hellCard.locator('.ds-pc-hell-flames i')).toHaveCount(8)

      // clawing back out clears it everywhere
      await page.getByTestId('hell-return').click()
      await expect(page.locator('.cs-hell-active')).toHaveCount(0)
      await expect(gm.locator('.ds-player-card.in-hell')).toHaveCount(0)
    } finally {
      await room.close()
    }
  })
})
