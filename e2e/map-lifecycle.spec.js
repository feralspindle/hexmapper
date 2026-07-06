import { expect, test } from '@playwright/test'
import {
  createThreeRoleCampaign,
  selectHexAndOpenInspector,
} from './support/app.js'
import { e2eAccounts, missingE2EAccountEnv, uniqueCampaignName } from './support/env.js'

const missingEnv = missingE2EAccountEnv()

const contextOptions = { viewport: { width: 1920, height: 1080 } }

test.describe.serial('map lifecycle', () => {
  test.skip(
    missingEnv.length > 0,
    `Set seeded E2E account env vars to run map lifecycle tests: ${missingEnv.join(', ')}`,
  )

  test('GM creates, renames, and deletes a child map; every client converges', async ({ browser }) => {
    const room = await createThreeRoleCampaign(browser, e2eAccounts(), {
      mode: 'fow',
      name: uniqueCampaignName('E2E Map Lifecycle'),
      contextOptions,
    })

    try {
      await selectHexAndOpenInspector(room.gm.page, 0, 0)
      await room.gm.page.getByTestId('add-child-map').click()
      await room.gm.page.getByTestId('child-map-name').fill('Barrowdelve')
      await room.gm.page.getByTestId('child-map-confirm').click()

      await expect(room.gm.page.getByTestId('active-map-name')).toHaveText('Barrowdelve')
      await expect(room.player1.page.getByTestId('active-map-name')).toHaveText('Barrowdelve')
      await expect(room.player2.page.getByTestId('active-map-name')).toHaveText('Barrowdelve')

      await room.gm.page.getByTestId('map-breadcrumb').first().click()
      await expect(room.gm.page.getByTestId('active-map-name')).toHaveCount(0)
      await expect(room.player1.page.getByTestId('active-map-name')).toHaveCount(0)
      await expect(room.player2.page.getByTestId('active-map-name')).toHaveCount(0)

      await selectHexAndOpenInspector(room.gm.page, 0, 0)
      await expect(room.gm.page.getByTestId('child-map-card')).toHaveCount(1)

      await room.gm.page.getByTestId('child-map-rename').click()
      await room.gm.page.getByTestId('child-map-rename-input').fill('Sunken Barrowdelve')
      await room.gm.page.getByTestId('child-map-rename-confirm').click()
      await expect(room.gm.page.getByTestId('child-map-card')).toContainText('Sunken Barrowdelve')

      await room.gm.page.getByTestId('hex-tool-reveal').click()
      await room.gm.page.locator('[data-testid="hex-cell"][data-q="0"][data-r="0"]').click()
      await selectHexAndOpenInspector(room.player1.page, 0, 0)
      await expect(room.player1.page.getByTestId('child-map-card')).toContainText('Sunken Barrowdelve')

      await room.gm.page.getByTestId('child-map-enter').click()
      await expect(room.gm.page.getByTestId('active-map-name')).toHaveText('Sunken Barrowdelve')
      await expect(room.player1.page.getByTestId('active-map-name')).toHaveText('Sunken Barrowdelve')
      await expect(room.player2.page.getByTestId('active-map-name')).toHaveText('Sunken Barrowdelve')

      await room.gm.page.getByTestId('map-breadcrumb').first().click()
      await expect(room.gm.page.getByTestId('active-map-name')).toHaveCount(0)

      await selectHexAndOpenInspector(room.gm.page, 0, 0)
      await room.gm.page.getByTestId('child-map-delete').click()
      await room.gm.page.getByTestId('confirm-accept').click()
      await expect(room.gm.page.getByTestId('child-map-card')).toHaveCount(0)
      await expect(room.player1.page.getByTestId('child-map-card')).toHaveCount(0)

      await expect(room.gm.page.getByTestId('hex-grid')).toBeVisible()
      await expect(room.player1.page.getByTestId('hex-grid')).toBeVisible()
      await expect(room.player2.page.getByTestId('hex-grid')).toBeVisible()
      await expect(room.player1.page.getByTestId('active-map-name')).toHaveCount(0)
      await expect(room.player2.page.getByTestId('active-map-name')).toHaveCount(0)
    } finally {
      await room.close()
    }
  })
})
