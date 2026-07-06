import { expect, test } from '@playwright/test'
import { createThreeRoleCampaign, openNotebook } from './support/app.js'
import { e2eAccounts, missingE2EAccountEnv, uniqueCampaignName } from './support/env.js'

const missingEnv = missingE2EAccountEnv()

const contextOptions = { viewport: { width: 1920, height: 1080 } }

const tinyPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

test.describe.serial('party notebook, calendar, and photos', () => {
  test.skip(
    missingEnv.length > 0,
    `Set seeded E2E account env vars to run party tool tests: ${missingEnv.join(', ')}`,
  )

  test('quests and notes sync between players and GM', async ({ browser }) => {
    const room = await createThreeRoleCampaign(browser, e2eAccounts(), {
      mode: 'fow',
      name: uniqueCampaignName('E2E Notebook'),
      contextOptions,
    })

    try {
      await openNotebook(room.player1.page, 'quests')
      await room.player1.page.getByTestId('quest-new').click()
      await expect(room.player1.page.getByTestId('quest-card')).toHaveCount(1)
      await room.player1.page.getByTestId('quest-title').fill('Find the Sunken Bell')

      await openNotebook(room.gm.page, 'quests')
      await expect(room.gm.page.getByTestId('quest-card')).toHaveCount(1)
      await expect(room.gm.page.getByTestId('quest-title')).toHaveValue('Find the Sunken Bell')

      await room.gm.page.getByTestId('quest-complete').click()
      await expect(room.gm.page.getByTestId('quest-card')).toHaveCount(0)
      await expect(room.player1.page.getByTestId('quest-card')).toHaveCount(0)

      await openNotebook(room.gm.page, 'notes')
      await room.gm.page.getByTestId('note-new').click()
      await expect(room.gm.page.getByTestId('note-card')).toHaveCount(1)
      await room.gm.page.getByTestId('note-title').fill('Session 12')
      await room.gm.page.getByTestId('note-content').fill('The party reached the sunken chapel.')

      await openNotebook(room.player1.page, 'notes')
      await expect(room.player1.page.getByTestId('note-card')).toHaveCount(1)
      await expect(room.player1.page.getByTestId('note-title')).toHaveValue('Session 12')
      await expect(room.player1.page.getByTestId('note-content')).toHaveValue(
        'The party reached the sunken chapel.',
      )
    } finally {
      await room.close()
    }
  })

  test('GM advances the calendar and every player sees the new date', async ({ browser }) => {
    const room = await createThreeRoleCampaign(browser, e2eAccounts(), {
      mode: 'fow',
      name: uniqueCampaignName('E2E Calendar'),
      contextOptions,
    })

    try {
      await openNotebook(room.gm.page, 'calendar')
      await openNotebook(room.player1.page, 'calendar')
      await openNotebook(room.player2.page, 'calendar')

      const before = await room.gm.page.getByTestId('calendar-today-label').innerText()
      await room.gm.page.getByTestId('calendar-advance-day').click()

      const gmLabel = room.gm.page.getByTestId('calendar-today-label')
      await expect(gmLabel).not.toHaveText(before)
      const after = await gmLabel.innerText()

      await expect(room.player1.page.getByTestId('calendar-today-label')).toHaveText(after)
      await expect(room.player2.page.getByTestId('calendar-today-label')).toHaveText(after)
    } finally {
      await room.close()
    }
  })

  test('GM broadcasts a reference photo and players can view and dismiss it', async ({ browser }) => {
    const room = await createThreeRoleCampaign(browser, e2eAccounts(), {
      mode: 'fow',
      name: uniqueCampaignName('E2E Photos'),
      contextOptions,
    })

    try {
      await room.gm.page.getByRole('button', { name: 'Inspect & Photos' }).click()
      await room.gm.page.getByTestId('photo-file-input').setInputFiles({
        name: 'relic.png',
        mimeType: 'image/png',
        buffer: tinyPng,
      })
      await room.gm.page.getByTestId('photo-name-input').fill('E2E Relic')
      await room.gm.page.getByTestId('photo-upload-confirm').click()

      await expect(room.gm.page.getByTestId('photo-reveal')).toBeVisible()
      await room.gm.page.getByTestId('photo-reveal').click()
      await room.gm.page.getByTestId('confirm-accept').click()

      await expect(room.player1.page.getByTestId('photo-broadcast')).toBeVisible()
      await expect(room.player1.page.getByTestId('photo-broadcast-name')).toHaveText('E2E Relic')
      await expect(room.player2.page.getByTestId('photo-broadcast')).toBeVisible()

      await room.player1.page.getByTestId('photo-broadcast-close').click()
      await expect(room.player1.page.getByTestId('photo-broadcast')).toHaveCount(0)
      await expect(room.player2.page.getByTestId('photo-broadcast')).toBeVisible()
      await room.player2.page.getByTestId('photo-broadcast-close').click()
      await expect(room.player2.page.getByTestId('photo-broadcast')).toHaveCount(0)
    } finally {
      await room.close()
    }
  })
})
