import { expect } from '@playwright/test'

export function hexCell(page, q, r) {
  return page.locator(`[data-testid="hex-cell"][data-q="${q}"][data-r="${r}"]`).first()
}

export async function openOracle(page) {
  await page.getByRole('button', { name: 'Oracle' }).click()
  await page.getByTestId('oracle-roll-yes-no').waitFor()
}

export async function loginByEmail(page, account) {
  await page.goto('/')
  await page.getByTestId('auth-tab-email').click()
  await page.getByTestId('auth-email').fill(account.email)
  await page.getByTestId('auth-password').fill(account.password)
  await page.getByTestId('auth-submit').click()

  const authError = page.getByText(/invalid login credentials/i)
  await expect
    .poll(async () => {
      if (await page.getByTestId('campaign-create').isVisible().catch(() => false)) {
        return 'signed-in'
      }
      if (await authError.isVisible().catch(() => false)) {
        return 'invalid-credentials'
      }
      return 'pending'
    })
    .toBe('signed-in')
}

export async function dismissWelcome(page) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const overlay = page.locator('.ds-wm-overlay')
    if ((await overlay.count()) === 0) return

    const ok = page.getByTestId('welcome-ok')
    if (await ok.isVisible().catch(() => false)) {
      await ok.click()
      await page.waitForTimeout(100)
      continue
    }

    const close = page.getByTestId('welcome-close')
    if (await close.isVisible().catch(() => false)) {
      await close.click()
      await page.waitForTimeout(100)
      continue
    }
  }
}

export async function closeMapSettings(page) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const panel = page.locator('.map-settings-panel')
    if ((await panel.count()) === 0) return

    const close = page.getByTestId('map-settings-close')
    if (await close.isVisible().catch(() => false)) {
      await close.click()
      await page.waitForTimeout(100)
    }
  }
}

export async function closePartyPanel(page) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    if ((await page.locator('.ds-party-panel').count()) === 0) return
    if ((await page.locator('.ds-wm-overlay').count()) > 0) return

    const toggle = page.locator('[data-testid="hex-party-toggle"][aria-pressed="true"]').first()
    if (await toggle.isVisible().catch(() => false)) {
      await toggle.click({ timeout: 1000 }).catch(() => {})
      await page.waitForTimeout(100)
    }
  }
}

export async function prepareHexInteractions(page) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await dismissWelcome(page)
    await closeMapSettings(page)
    await closePartyPanel(page)
    if (
      (await page.locator('.ds-wm-overlay').count()) === 0 &&
      (await page.locator('.map-settings-panel').count()) === 0 &&
      (await page.locator('.ds-party-panel').count()) === 0
    ) {
      break
    }
    await page.waitForTimeout(100)
  }
  await expect(page.locator('.ds-wm-overlay')).toHaveCount(0)
  await expect(page.locator('.map-settings-panel')).toHaveCount(0)
  await expect(page.locator('.ds-party-panel')).toHaveCount(0)
  await expect(page.getByTestId('hex-grid')).toBeVisible()
}

export function currentSessionId(page) {
  const [, , sessionId] = new URL(page.url()).pathname.split('/')
  return sessionId
}

export async function createCampaign(page, name, { playMode = 'gm' } = {}) {
  await page.getByTestId('campaign-name').fill(name)
  if (playMode === 'gm_less') {
    await page.getByTestId('campaign-mode-gm-less').click()
  }
  await page.getByTestId('campaign-create').click()
  await page.waitForURL(/\/session\/[0-9a-f-]+$/i)
  return currentSessionId(page)
}

export async function chooseFogOfWar(page) {
  await expect(page.getByTestId('hex-grid')).toBeVisible()
  await prepareHexInteractions(page)
}

export async function chooseBlankSlate(page) {
  if (await page.getByTestId('hex-tool-paint').isVisible().catch(() => false)) {
    await expect(page.getByTestId('hex-grid')).toBeVisible()
    await prepareHexInteractions(page)
    return
  }

  const picker = page.getByTestId('mode-blank')
  if (!(await picker.isVisible().catch(() => false))) {
    await prepareHexInteractions(page)
    const switchMode = page.getByRole('button', { name: 'Switch' })
    await expect(switchMode).toBeVisible()
    await switchMode.click()
  }
  await expect(picker).toBeVisible()
  await picker.click()
  await expect(page.getByTestId('hex-grid')).toBeVisible()
  await expect(page.getByTestId('hex-tool-paint')).toBeVisible()
  await prepareHexInteractions(page)
}

export async function joinCampaign(page, account, sessionId) {
  await loginByEmail(page, account)
  await page.getByTestId('campaign-join-input').fill(sessionId)
  await page.getByTestId('campaign-join').click()
  await page.waitForURL(new RegExp(`/session/${sessionId}$`))
  await expect(page.getByTestId('hex-grid')).toBeVisible()
  await prepareHexInteractions(page)
}

export async function openRolePage(browser, account) {
  const context = await browser.newContext()
  const page = await context.newPage()
  await loginByEmail(page, account)
  return { context, page }
}

export async function createThreeRoleCampaign(browser, accounts, { mode, name }) {
  const gm = await openRolePage(browser, accounts.gm)
  const sessionId = await createCampaign(gm.page, name, { playMode: mode === 'gm_less' ? 'gm_less' : 'gm' })
  if (mode === 'blank' || mode === 'gm_less') {
    await chooseBlankSlate(gm.page)
  } else {
    await chooseFogOfWar(gm.page)
  }

  const player1 = {
    context: await browser.newContext(),
  }
  player1.page = await player1.context.newPage()
  await joinCampaign(player1.page, accounts.player1, sessionId)

  const player2 = {
    context: await browser.newContext(),
  }
  player2.page = await player2.context.newPage()
  await joinCampaign(player2.page, accounts.player2, sessionId)

  return {
    sessionId,
    gm,
    player1,
    player2,
    async close() {
      await Promise.all([
        gm.context.close(),
        player1.context.close(),
        player2.context.close(),
      ])
    },
  }
}
