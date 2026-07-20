import { expect, test } from '@playwright/test'

// browser.newContext() does not inherit project `use` options, so multi-context
// helpers must copy the device profile (mobile viewport, touch, UA) themselves.
// Explicit per-spec contextOptions still win, e.g. tests that need a wide
// viewport for the crowded topbar.
export function deviceContextOptions() {
  const use = test.info().project.use ?? {}
  const options = {}
  for (const key of ['viewport', 'userAgent', 'deviceScaleFactor', 'isMobile', 'hasTouch']) {
    if (use[key] !== undefined) options[key] = use[key]
  }
  return options
}

export function hexCell(page, q, r) {
  return page.locator(`[data-testid="hex-cell"][data-q="${q}"][data-r="${r}"]`).first()
}

export async function openToolkit(page) {
  const panel = page.getByTestId('solo-toolkit-panel')
  if (!(await panel.isVisible().catch(() => false))) {
    await page.getByTestId(/toolkit-toggle/).click()
  }
  await panel.waitFor()
  return panel
}

export async function openOracle(page) {
  const panel = await openToolkit(page)
  await panel.getByRole('button', { name: 'Oracle' }).click()
  await page.getByTestId('oracle-roll-yes-no').waitFor()
}

export async function openStatBlocks(page) {
  const panel = await openToolkit(page)
  await panel.getByRole('button', { name: 'Codex' }).click()
  await page.getByTestId('statblock-add-name').waitFor()
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

async function closeMapSettingsOnce(page) {
  if ((await page.locator('.map-settings-panel').count()) === 0) return
  await page.getByTestId('map-settings-close').click({ timeout: 1000 }).catch(() => {})
}

async function closeSessionPanelOnce(page) {
  // On narrow viewports the right session panel overlays the map behind a
  // scrim that swallows toolbar clicks; on desktop it docks and the scrim
  // never shows. Clicking the scrim closes the panel.
  const scrim = page.locator('.ds-panel-scrim')
  if (await scrim.isVisible().catch(() => false)) {
    await scrim.click({ timeout: 1000 }).catch(() => {})
  }
}

export async function closeSessionPanel(page) {
  await expect(async () => {
    await closeSessionPanelOnce(page)
    await expect(page.locator('.ds-panel-scrim')).not.toBeVisible({ timeout: 1000 })
  }).toPass({ timeout: 15_000 })
}

async function closePartyPanelOnce(page) {
  if ((await page.locator('.ds-party-panel').count()) === 0) return

  const close = page.getByTestId('party-panel-close')
  if (await close.isVisible().catch(() => false)) {
    await close.click({ timeout: 1000 }).catch(() => {})
    return
  }

  const toggles = page.locator('[data-testid="hex-party-toggle"][aria-pressed="true"]')
  const count = await toggles.count()
  for (let i = 0; i < count; i += 1) {
    const toggle = toggles.nth(i)
    if (await toggle.isVisible().catch(() => false)) {
      await toggle.click({ timeout: 1000 }).catch(() => {})
      return
    }
  }
}

export async function prepareHexInteractions(page) {
  // After a reload the close pass can run against the not-yet-mounted app,
  // find nothing to close, and exit — leaving the party panel to mount right
  // after and trip the assertions below. Wait for the map shell first so the
  // panels the pass checks for actually exist when they're going to.
  await expect(page.getByTestId('hex-grid')).toBeVisible()
  // The GM map-settings panel auto-opens when the first map finishes loading
  // (HexMapView watches maps.length going 0 -> >0), and the party panel
  // starts open, so a close can land early and get undone. Keep closing
  // inside the poll until everything stays shut, rather than burning a fixed
  // number of attempts and then asserting while a panel is still up.
  await expect(async () => {
    // The floating party panel sits above the map settings panel, so it must
    // go first or it intercepts the settings close click. The session-panel
    // scrim sits above the settings panel too, so it goes before that close.
    await closePartyPanelOnce(page)
    await closeSessionPanelOnce(page)
    await closeMapSettingsOnce(page)
    await expect(page.locator('.ds-panel-scrim')).not.toBeVisible({ timeout: 1000 })
    await expect(page.locator('.map-settings-panel')).toHaveCount(0, { timeout: 1000 })
    await expect(page.locator('.ds-party-panel')).toHaveCount(0, { timeout: 1000 })
  }).toPass({ timeout: 30_000 })
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
  // A fresh fow campaign auto-opens the GM map-settings panel once the first
  // map loads. Wait for that open before preparing so the close below can't
  // race the load - otherwise the panel reopens after we've moved on. If the
  // map was already loaded (no auto-open), fall straight through.
  await page
    .locator('.map-settings-panel')
    .waitFor({ state: 'visible', timeout: 15_000 })
    .catch(() => {})
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

export async function openNotebook(page, tab) {
  if ((await page.locator('.pn-panel').count()) === 0) {
    const hexToggle = page.getByTestId('hex-vault-toggle')
    if (await hexToggle.count()) {
      await hexToggle.click()
    } else {
      await page.getByTestId('dungeon-vault-toggle').click()
    }
    await page.locator('.pn-panel').waitFor()
  }
  await page.getByTestId(`notebook-tab-${tab}`).click()
}

export async function openCharacterSheet(page) {
  const sheet = page.getByTestId('char-sheet')
  if (await sheet.isVisible().catch(() => false)) return
  await page.getByTestId('char-sheet-toggle').click()
  await expect(sheet).toBeVisible()
}

export async function openCharacterSheetTab(page, tab) {
  await openCharacterSheet(page)
  await page.getByTestId(`char-tab-${tab}`).click()
}

export async function createCharacter(page, name) {
  await page.getByTestId('char-picker-toggle').click()
  await page.getByTestId('char-picker-new').click()
  await page.getByTestId('new-char-name').fill(name)
  await page.getByTestId('new-char-create').click()
  await expect(page.getByTestId('new-char-name')).toHaveCount(0)
  await expect(page.getByTestId('char-picker-toggle')).toContainText(name)
}

export async function importCharacterJson(page, json, expectedName) {
  await page.getByTestId('char-picker-toggle').click()
  await page.getByTestId('char-picker-import').click()
  await page.getByTestId('char-import-json').fill(json)
  await page.getByTestId('char-import-submit').click()
  await expect(page.getByTestId('char-picker-toggle')).toContainText(expectedName)
}

export async function selectHexAndOpenInspector(page, q, r) {
  await prepareHexInteractions(page)
  const selectTool = page.getByTestId('hex-tool-select')
  if (await selectTool.count()) await selectTool.click()
  await hexCell(page, q, r).click()
}

export async function openRolePage(browser, account, contextOptions = {}) {
  const context = await browser.newContext({ ...deviceContextOptions(), ...contextOptions })
  const page = await context.newPage()
  await loginByEmail(page, account)
  return { context, page }
}

export async function createThreeRoleCampaign(browser, accounts, { mode, name, contextOptions = {} }) {
  const mergedOptions = { ...deviceContextOptions(), ...contextOptions }
  const gm = await openRolePage(browser, accounts.gm, contextOptions)
  const sessionId = await createCampaign(gm.page, name, { playMode: mode === 'gm_less' ? 'gm_less' : 'gm' })
  if (mode === 'blank' || mode === 'gm_less') {
    await chooseBlankSlate(gm.page)
  } else {
    await chooseFogOfWar(gm.page)
  }

  const player1 = {
    context: await browser.newContext(mergedOptions),
  }
  player1.page = await player1.context.newPage()
  await joinCampaign(player1.page, accounts.player1, sessionId)

  const player2 = {
    context: await browser.newContext(mergedOptions),
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
