import { expect, test } from '@playwright/test'
import { createThreeRoleCampaign, hexCell } from './support/app.js'
import { e2eAccounts, missingE2EAccountEnv, uniqueCampaignName } from './support/env.js'

const missingEnv = missingE2EAccountEnv()

test.describe.serial('hex map multiplayer sync', () => {
  test.skip(
    missingEnv.length > 0,
    `Set seeded E2E account env vars to run multiplayer tests: ${missingEnv.join(', ')}`,
  )

  test('GM reveal and hide propagates to both players', async ({ browser }) => {
    const room = await createThreeRoleCampaign(browser, e2eAccounts(), {
      mode: 'fow',
      name: uniqueCampaignName('E2E FOW'),
    })

    try {
      await expect(hexCell(room.player1.page, 0, 0)).toHaveAttribute('data-visible-to-player', 'false')
      await expect(hexCell(room.player2.page, 0, 0)).toHaveAttribute('data-visible-to-player', 'false')

      await room.gm.page.getByTestId('hex-tool-reveal').click()
      await hexCell(room.gm.page, 0, 0).click()

      await expect(hexCell(room.player1.page, 0, 0)).toHaveAttribute('data-visible-to-player', 'true')
      await expect(hexCell(room.player2.page, 0, 0)).toHaveAttribute('data-visible-to-player', 'true')

      await room.gm.page.getByTestId('hex-tool-hide').click()
      await hexCell(room.gm.page, 0, 0).click()

      await expect(hexCell(room.player1.page, 0, 0)).toHaveAttribute('data-visible-to-player', 'false')
      await expect(hexCell(room.player2.page, 0, 0)).toHaveAttribute('data-visible-to-player', 'false')
    } finally {
      await room.close()
    }
  })

  test('GM can reveal all and then hide one hex from players', async ({ browser }) => {
    const room = await createThreeRoleCampaign(browser, e2eAccounts(), {
      mode: 'fow',
      name: uniqueCampaignName('E2E Reveal All'),
    })

    try {
      await room.gm.page.getByTestId('hex-reveal-all').click()
      await expect(hexCell(room.player1.page, 1, 0)).toHaveAttribute('data-visible-to-player', 'true')
      await expect(hexCell(room.player2.page, 1, 0)).toHaveAttribute('data-visible-to-player', 'true')

      await room.gm.page.getByTestId('hex-tool-hide').click()
      await hexCell(room.gm.page, 1, 0).click()

      await expect(hexCell(room.player1.page, 1, 0)).toHaveAttribute('data-visible-to-player', 'false')
      await expect(hexCell(room.player2.page, 1, 0)).toHaveAttribute('data-visible-to-player', 'false')
    } finally {
      await room.close()
    }
  })

  test('player terrain edits sync to GM and other players on blank maps', async ({ browser }) => {
    const room = await createThreeRoleCampaign(browser, e2eAccounts(), {
      mode: 'blank',
      name: uniqueCampaignName('E2E Blank'),
    })

    try {
      await room.player1.page.getByTestId('hex-tool-paint').click()
      await hexCell(room.player1.page, 0, 0).click()

      await expect(hexCell(room.gm.page, 0, 0)).toHaveAttribute('data-terrain', 'plains')
      await expect(hexCell(room.player2.page, 0, 0)).toHaveAttribute('data-terrain', 'plains')

      await room.player2.page.getByTestId('hex-tool-marker').click()
      await hexCell(room.player2.page, 0, 0).click()

      await expect(hexCell(room.gm.page, 0, 0)).toHaveAttribute('data-marker-count', '1')
      await expect(hexCell(room.player1.page, 0, 0)).toHaveAttribute('data-marker-count', '1')
    } finally {
      await room.close()
    }
  })
})
