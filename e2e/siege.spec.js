import { expect, test } from '@playwright/test'
import { createCharacter, createThreeRoleCampaign, openNotebook } from './support/app.js'
import { e2eAccounts, missingE2EAccountEnv, uniqueCampaignName } from './support/env.js'

const missingEnv = missingE2EAccountEnv()

function rollRows(page) {
  return page.getByTestId('dice-roll-row')
}

test.describe.serial('siege weapons and exploding dice', () => {
  test.skip(
    missingEnv.length > 0,
    `Set seeded E2E account env vars to run siege tests: ${missingEnv.join(', ')}`,
  )

  test('a player arms a weapon, crew fires it, rolls sync and reload needs crew', async ({ browser }) => {
    const room = await createThreeRoleCampaign(browser, e2eAccounts(), {
      mode: 'fow',
      name: uniqueCampaignName('E2E Siege'),
    })

    try {
      const gm = room.gm.page
      await openNotebook(gm, 'siege')

      // any player can arm weapons, not just the GM
      await createCharacter(room.player1.page, 'Gunner')
      await openNotebook(room.player1.page, 'siege')

      await room.player1.page.getByTestId('siege-new').click()
      await room.player1.page.getByTestId('siege-field-name').fill('Ballista')
      await room.player1.page.getByTestId('siege-field-notation').fill('3d6!')
      await room.player1.page.getByTestId('siege-field-hp').fill('12')
      await room.player1.page.getByTestId('siege-field-ammo-tracked').check()
      await room.player1.page.getByTestId('siege-field-max-ammo').fill('5')
      await room.player1.page.getByTestId('siege-form-save').click()

      await expect(room.player1.page.getByTestId('siege-card')).toHaveCount(1)
      await expect(room.player1.page.getByTestId('siege-card')).toContainText('Ballista')
      await expect(room.player1.page.getByTestId('siege-card')).toContainText('3d6!')
      await expect(room.player1.page.getByTestId('siege-card')).toContainText('5/5 ammo')

      // weapon appears for the GM via realtime
      await expect(gm.getByTestId('siege-card')).toHaveCount(1)

      // player 1 crews it with their active character, then fires
      await room.player1.page.getByTestId('siege-join').click()
      await expect(room.player1.page.getByTestId('siege-card')).toContainText('Gunner')

      // fire: attack + damage rolls land for every participant
      await room.player1.page.getByTestId('siege-fire').click()

      await expect(rollRows(room.player1.page)).toHaveCount(2)
      await expect(rollRows(room.gm.page)).toHaveCount(2)
      await expect(rollRows(room.player2.page)).toHaveCount(2)
      await expect(rollRows(room.player2.page).first()).toContainText('Ballista damage')
      await expect(rollRows(room.player2.page).nth(1)).toContainText('Ballista attack')

      // weapon is unloaded and one shot is spent, everywhere
      for (const page of [room.player1.page, room.gm.page]) {
        await expect(page.getByTestId('siege-card')).toContainText('unloaded')
        await expect(page.getByTestId('siege-card')).toContainText('4/5 ammo')
      }

      // reload with crew aboard
      await room.player1.page.getByTestId('siege-reload').click()
      await expect(room.player1.page.getByTestId('siege-card')).toContainText('loaded')
      await expect(room.gm.page.getByTestId('siege-card')).toContainText('loaded')

      // damage buttons are on the card for anyone
      await room.gm.page.getByTestId('siege-card').getByTitle('Deal 5 damage').click()
      await expect(room.gm.page.getByTestId('siege-card')).toContainText('7/12 hp')
    } finally {
      await room.close()
    }
  })

  test('exploding toggle sends exploding notation through the regular roller', async ({ browser }) => {
    const room = await createThreeRoleCampaign(browser, e2eAccounts(), {
      mode: 'fow',
      name: uniqueCampaignName('E2E Explode'),
    })

    try {
      const p1 = room.player1.page
      await p1.locator('[data-testid="dice-die"][data-die="d6"]').click()
      await p1.locator('[data-testid="dice-die"][data-die="d6"]').click()
      await p1.getByTestId('dice-explode-toggle').click()
      await p1.getByTestId('dice-roll').click()

      await expect(rollRows(p1)).toHaveCount(1)
      await expect(rollRows(p1).first()).toContainText('2d6!')
      await expect(rollRows(room.gm.page).first()).toContainText('2d6!')
    } finally {
      await room.close()
    }
  })
})
