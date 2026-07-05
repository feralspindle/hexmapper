import { expect, test } from '@playwright/test'
import { createThreeRoleCampaign } from './support/app.js'
import { e2eAccounts, missingE2EAccountEnv, uniqueCampaignName } from './support/env.js'

const missingEnv = missingE2EAccountEnv()

function rollRows(page) {
  return page.getByTestId('dice-roll-row')
}

function chatMessages(page) {
  return page.getByTestId('chat-message')
}

async function sendChat(page, body) {
  await page.getByTestId('chat-input').fill(body)
  await page.getByTestId('chat-send').click()
}

test.describe.serial('dice and chat multiplayer sync', () => {
  test.skip(
    missingEnv.length > 0,
    `Set seeded E2E account env vars to run dice/chat tests: ${missingEnv.join(', ')}`,
  )

  test('a player dice roll appears exactly once for every participant', async ({ browser }) => {
    const room = await createThreeRoleCampaign(browser, e2eAccounts(), {
      mode: 'fow',
      name: uniqueCampaignName('E2E Dice'),
    })

    try {
      await room.player1.page.locator('[data-testid="dice-die"][data-die="d20"]').click()
      await room.player1.page.getByTestId('dice-roll').click()

      await expect(rollRows(room.player1.page)).toHaveCount(1)
      await expect(rollRows(room.gm.page)).toHaveCount(1)
      await expect(rollRows(room.player2.page)).toHaveCount(1)
      await expect(rollRows(room.gm.page).first()).toContainText('1d20')

      await room.gm.page.locator('[data-testid="dice-die"][data-die="d6"]').click()
      await room.gm.page.locator('[data-testid="dice-die"][data-die="d6"]').click()
      await room.gm.page.getByTestId('dice-roll').click()

      await expect(rollRows(room.gm.page)).toHaveCount(2)
      await expect(rollRows(room.player1.page)).toHaveCount(2)
      await expect(rollRows(room.player2.page)).toHaveCount(2)
      await expect(rollRows(room.player2.page).first()).toContainText('2d6')
    } finally {
      await room.close()
    }
  })

  test('chat messages reach every tab exactly once, in both directions', async ({ browser }) => {
    const room = await createThreeRoleCampaign(browser, e2eAccounts(), {
      mode: 'fow',
      name: uniqueCampaignName('E2E Chat'),
    })

    try {
      await sendChat(room.player1.page, 'We approach the gate')

      await expect(chatMessages(room.gm.page)).toHaveCount(1)
      await expect(chatMessages(room.gm.page).first()).toContainText('We approach the gate')
      await expect(chatMessages(room.player2.page)).toHaveCount(1)
      await expect(chatMessages(room.player1.page)).toHaveCount(1)

      await sendChat(room.gm.page, 'The gate creaks open')

      await expect(chatMessages(room.player1.page)).toHaveCount(2)
      await expect(chatMessages(room.player2.page)).toHaveCount(2)
      await expect(chatMessages(room.gm.page)).toHaveCount(2)
      await expect(chatMessages(room.player1.page).last()).toContainText('The gate creaks open')
    } finally {
      await room.close()
    }
  })
})
