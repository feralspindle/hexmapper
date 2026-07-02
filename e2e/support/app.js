import { expect } from '@playwright/test'

export function hexCell(page, q, r) {
  return page.locator(`[data-testid="hex-cell"][data-q="${q}"][data-r="${r}"]`).first()
}

export async function loginByEmail(page, account) {
  await page.goto('/')
  await page.getByTestId('auth-tab-email').click()
  await page.getByTestId('auth-email').fill(account.email)
  await page.getByTestId('auth-password').fill(account.password)
  await page.getByTestId('auth-submit').click()
  await expect(page.getByTestId('campaign-create')).toBeVisible()
}

export async function dismissWelcome(page) {
  const ok = page.getByTestId('welcome-ok')
  if (await ok.isVisible().catch(() => false)) {
    await ok.click()
  }
}

export async function closeMapSettings(page) {
  const close = page.getByTestId('map-settings-close')
  if (await close.isVisible().catch(() => false)) {
    await close.click()
  }
}

export function currentSessionId(page) {
  const [, , sessionId] = new URL(page.url()).pathname.split('/')
  return sessionId
}

export async function createCampaign(page, name) {
  await page.getByTestId('campaign-name').fill(name)
  await page.getByTestId('campaign-create').click()
  await page.waitForURL(/\/session\/[0-9a-f-]+$/i)
  return currentSessionId(page)
}

export async function chooseFogOfWar(page) {
  const picker = page.getByTestId('mode-fow-existing')
  if (await picker.isVisible().catch(() => false)) {
    await picker.click()
  }
  await expect(page.getByTestId('hex-grid')).toBeVisible()
  await dismissWelcome(page)
  await closeMapSettings(page)
}

export async function chooseBlankSlate(page) {
  const picker = page.getByTestId('mode-blank')
  if (await picker.isVisible().catch(() => false)) {
    await picker.click()
  }
  await expect(page.getByTestId('hex-grid')).toBeVisible()
  await dismissWelcome(page)
  await closeMapSettings(page)
}

export async function joinCampaign(page, account, sessionId) {
  await loginByEmail(page, account)
  await page.getByTestId('campaign-join-input').fill(sessionId)
  await page.getByTestId('campaign-join').click()
  await page.waitForURL(new RegExp(`/session/${sessionId}$`))
  await expect(page.getByTestId('hex-grid')).toBeVisible()
  await dismissWelcome(page)
}

export async function openRolePage(browser, account) {
  const context = await browser.newContext()
  const page = await context.newPage()
  await loginByEmail(page, account)
  return { context, page }
}

export async function createThreeRoleCampaign(browser, accounts, { mode, name }) {
  const gm = await openRolePage(browser, accounts.gm)
  const sessionId = await createCampaign(gm.page, name)
  if (mode === 'blank') {
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
