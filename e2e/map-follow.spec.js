import { expect, test } from '@playwright/test'
import { createThreeRoleCampaign, hexCell, prepareHexInteractions } from './support/app.js'
import { e2eAccounts, missingE2EAccountEnv, uniqueCampaignName } from './support/env.js'

const missingEnv = missingE2EAccountEnv()

// At the default 1280x720 the crowded topbar squeezes the breadcrumb nav
// (min-width: 0, overflow: hidden) to zero width, so the "back to parent"
// button exists but is unclickable. Give every role a roomier window.
const contextOptions = { viewport: { width: 1920, height: 1080 } }

test.describe.serial('players follow the GM active map', () => {
  test.skip(
    missingEnv.length > 0,
    `Set seeded E2E account env vars to run map-follow tests: ${missingEnv.join(', ')}`,
  )

  test('switching to a child map and back moves every player with the GM', async ({ browser }) => {
    const room = await createThreeRoleCampaign(browser, e2eAccounts(), {
      mode: 'fow',
      name: uniqueCampaignName('E2E Map Follow'),
      contextOptions,
    })

    try {
      await prepareHexInteractions(room.gm.page)
      await room.gm.page.getByTestId('hex-tool-select').click()
      await hexCell(room.gm.page, 0, 0).click()

      await room.gm.page.getByTestId('add-child-map').click()
      await room.gm.page.getByTestId('child-map-name').fill('Undercroft')
      await room.gm.page.getByTestId('child-map-confirm').click()

      await expect(room.gm.page.getByTestId('active-map-name')).toHaveText('Undercroft')
      await expect(room.player1.page.getByTestId('active-map-name')).toHaveText('Undercroft')
      await expect(room.player2.page.getByTestId('active-map-name')).toHaveText('Undercroft')

      await expect(room.gm.page.getByTestId('hex-grid')).toBeVisible()
      await expect(room.player1.page.getByTestId('hex-grid')).toBeVisible()
      await expect(room.player2.page.getByTestId('hex-grid')).toBeVisible()

      await room.gm.page.getByTestId('map-breadcrumb').first().click()

      await expect(room.gm.page.getByTestId('active-map-name')).toHaveCount(0)
      await expect(room.player1.page.getByTestId('active-map-name')).toHaveCount(0)
      await expect(room.player2.page.getByTestId('active-map-name')).toHaveCount(0)
      await expect(room.player1.page.getByTestId('hex-grid')).toBeVisible()
      await expect(room.player2.page.getByTestId('hex-grid')).toBeVisible()
    } finally {
      await room.close()
    }
  })
})
