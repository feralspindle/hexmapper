import { expect, test } from '@playwright/test'
import {
  createThreeRoleCampaign,
  selectHexAndOpenInspector,
} from './support/app.js'
import { e2eAccounts, missingE2EAccountEnv, uniqueCampaignName } from './support/env.js'

const missingEnv = missingE2EAccountEnv()

const contextOptions = { viewport: { width: 1920, height: 1080 } }

async function dismissDungeonOverlays(page) {
  const close = page.getByTestId('party-panel-close')
  if (await close.isVisible().catch(() => false)) {
    await close.click().catch(() => {})
  }
}

async function enterDungeonAsGm(gmPage) {
  await selectHexAndOpenInspector(gmPage, 0, 0)
  await gmPage.getByTestId('add-dungeon').click()
  await gmPage.getByTestId('dungeon-name-input').fill('E2E Crypt')
  await gmPage.getByTestId('dungeon-confirm').click()
  await gmPage.waitForURL(/\/dungeon\/[0-9a-f-]+$/i)
  await expect(gmPage.getByTestId('dungeon-canvas')).toBeVisible()
  await dismissDungeonOverlays(gmPage)
  return new URL(gmPage.url()).pathname
}

async function joinDungeon(page, dungeonPath) {
  await page.goto(dungeonPath)
  await expect(page.getByTestId('dungeon-canvas')).toBeVisible()
  await dismissDungeonOverlays(page)
}

async function dragOnCanvas(page, from, to) {
  const box = await page.getByTestId('dungeon-canvas').boundingBox()
  await page.mouse.move(box.x + from.x, box.y + from.y)
  await page.mouse.down()
  await page.mouse.move(box.x + to.x, box.y + to.y, { steps: 8 })
  await page.mouse.up()
}

function roomCount(page) {
  return page.getByTestId('dungeon-room')
}

test.describe.serial('dungeon editing sync', () => {
  test.skip(
    missingEnv.length > 0,
    `Set seeded E2E account env vars to run dungeon tests: ${missingEnv.join(', ')}`,
  )

  test('room, corridor, and fog edits propagate between GM and players in every direction', async ({ browser }) => {
    test.setTimeout(120_000)
    const room = await createThreeRoleCampaign(browser, e2eAccounts(), {
      mode: 'fow',
      name: uniqueCampaignName('E2E Dungeon'),
      contextOptions,
    })

    try {
      const dungeonPath = await enterDungeonAsGm(room.gm.page)
      await joinDungeon(room.player1.page, dungeonPath)
      await joinDungeon(room.player2.page, dungeonPath)

      await room.gm.page.getByTestId('dungeon-tool-room').click()
      await dragOnCanvas(room.gm.page, { x: 200, y: 200 }, { x: 320, y: 300 })

      await expect(roomCount(room.gm.page)).toHaveCount(1)
      await expect(roomCount(room.player1.page)).toHaveCount(1)
      await expect(roomCount(room.player2.page)).toHaveCount(1)

      await room.player1.page.getByTestId('dungeon-tool-room').click()
      await dragOnCanvas(room.player1.page, { x: 420, y: 200 }, { x: 540, y: 300 })

      await expect(roomCount(room.player1.page)).toHaveCount(2)
      await expect(roomCount(room.gm.page)).toHaveCount(2)
      await expect(roomCount(room.player2.page)).toHaveCount(2)

      await room.player2.page.getByTestId('dungeon-tool-corridor').click()
      const box = await room.player2.page.getByTestId('dungeon-canvas').boundingBox()
      await room.player2.page.mouse.click(box.x + 320, box.y + 250)
      await room.player2.page.mouse.click(box.x + 420, box.y + 250)
      await room.player2.page.mouse.dblclick(box.x + 420, box.y + 250)

      await expect(room.player2.page.getByTestId('dungeon-corridor')).toHaveCount(1)
      await expect(room.gm.page.getByTestId('dungeon-corridor')).toHaveCount(1)
      await expect(room.player1.page.getByTestId('dungeon-corridor')).toHaveCount(1)

      await room.gm.page.getByTestId('dungeon-map-settings').click()
      await room.gm.page.getByTestId('dungeon-fog-toggle').click()
      await room.gm.page.getByTestId('dungeon-settings-close').click()

      await expect(room.gm.page.getByTestId('dungeon-canvas')).toHaveAttribute('data-fog-mode', 'true')
      await expect(room.player1.page.getByTestId('dungeon-canvas')).toHaveAttribute('data-fog-mode', 'true')
      await expect(room.player2.page.getByTestId('dungeon-canvas')).toHaveAttribute('data-fog-mode', 'true')

      await room.gm.page.getByTestId('dungeon-tool-fog').click()
      await dragOnCanvas(room.gm.page, { x: 220, y: 220 }, { x: 300, y: 280 })

      const revealedOn = (page) =>
        page.getByTestId('dungeon-canvas').getAttribute('data-fog-revealed').then(Number)
      await expect.poll(() => revealedOn(room.gm.page)).toBeGreaterThan(0)
      await expect.poll(() => revealedOn(room.player1.page)).toBeGreaterThan(0)
      await expect.poll(() => revealedOn(room.player2.page)).toBeGreaterThan(0)
    } finally {
      await room.close()
    }
  })
})
