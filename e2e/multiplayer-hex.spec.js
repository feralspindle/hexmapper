import { expect, test } from '@playwright/test'
import {
  createThreeRoleCampaign,
  hexCell,
  prepareHexInteractions,
  selectHexAndOpenInspector,
} from './support/app.js'
import { e2eAccounts, missingE2EAccountEnv, uniqueCampaignName } from './support/env.js'

const missingEnv = missingE2EAccountEnv()

async function addGmMarker(page, q, r, kind) {
  await selectHexAndOpenInspector(page, q, r)
  await page.getByTestId(`gm-marker-add-${kind}`).click()
}

// Records everything that crosses a player's wire: hex-cell/api REST bodies and
// every realtime websocket frame (supabase or the rust /api/realtime). Bodies are
// read lazily so the handler never blocks the page. Returns the collected text plus
// the parsed hex-cells GET payload for structural sentinel checks.
function capturePlayerTraffic(page) {
  const bodyPromises = []
  const frames = []
  const hexCellsPayloads = []

  const onResponse = (response) => {
    const url = response.url()
    if (!/\/hex-cells|\/api\/|supabase\.co/.test(url)) return
    bodyPromises.push(response.text().catch(() => ''))
    if (response.request().method() === 'GET' && url.includes('/hex-cells')) {
      hexCellsPayloads.push(response.json().catch(() => null))
    }
  }
  const onWebSocket = (ws) => {
    ws.on('framereceived', (event) => {
      const payload = event.payload
      frames.push(typeof payload === 'string' ? payload : payload.toString('utf8'))
    })
  }

  page.on('response', onResponse)
  page.on('websocket', onWebSocket)

  return {
    async stop() {
      page.off('response', onResponse)
      page.off('websocket', onWebSocket)
      const bodies = await Promise.all(bodyPromises)
      const hexCellRows = (await Promise.all(hexCellsPayloads))
        .filter((rows) => Array.isArray(rows))
        .flat()
      return { wire: [...bodies, ...frames], hexCellRows }
    },
  }
}

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
      await expect(room.gm.page.getByRole('button', { name: 'Oracle' })).toHaveCount(0)
      await expect(room.player1.page.getByRole('button', { name: 'Oracle' })).toHaveCount(0)
      await prepareHexInteractions(room.gm.page)
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
      await prepareHexInteractions(room.gm.page)
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
      await prepareHexInteractions(room.player1.page)
      await prepareHexInteractions(room.player2.page)
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

  // The one hex-security guarantee from #10 that was never proven at the browser:
  // player network/api responses never contain gm_markers. The store strips them,
  // so a regression that reintroduced a direct supabase read or an unredacted
  // endpoint would render fine while leaking on the wire. This watches the wire.
  test('player network traffic never carries gm_markers or hidden-cell content', async ({ browser }) => {
    const room = await createThreeRoleCampaign(browser, e2eAccounts(), {
      mode: 'fow',
      name: uniqueCampaignName('E2E GM Marker Leak'),
    })

    try {
      await prepareHexInteractions(room.gm.page)

      // A revealed hex and a hidden hex, each carrying a gm_marker.
      await room.gm.page.getByTestId('hex-tool-reveal').click()
      await hexCell(room.gm.page, 0, 0).click()
      await expect(hexCell(room.player1.page, 0, 0)).toHaveAttribute('data-visible-to-player', 'true')
      await addGmMarker(room.gm.page, 0, 0, 'trap')
      await addGmMarker(room.gm.page, 1, 0, 'secret')

      // reveal-all reveals every cell, so hide (1,0) again to get a genuinely
      // hidden cell delivered as a sentinel under fog_reveal_all - that's the
      // redaction path this test exercises. wait for the reveal-all to land on
      // the player before hiding, otherwise the hide races the bulk reveal on the
      // server and (1,0) can come back revealed.
      await room.gm.page.getByTestId('hex-reveal-all').click()
      await expect(hexCell(room.player1.page, 1, 0)).toHaveAttribute('data-visible-to-player', 'true')
      await room.gm.page.getByTestId('hex-tool-hide').click()
      await hexCell(room.gm.page, 1, 0).click()
      await expect(hexCell(room.player1.page, 1, 0)).toHaveAttribute('data-visible-to-player', 'false')

      // Capture, then force a fresh load so the whole hex-cells GET is seen, and a
      // live reveal so a realtime frame for a gm-marked hex crosses the wire too.
      const capture = capturePlayerTraffic(room.player1.page)
      await room.player1.page.reload()
      await prepareHexInteractions(room.player1.page)
      await expect(hexCell(room.player1.page, 0, 0)).toHaveAttribute('data-visible-to-player', 'true')

      await addGmMarker(room.gm.page, 2, 0, 'treasure')
      await room.gm.page.getByTestId('hex-tool-reveal').click()
      await hexCell(room.gm.page, 2, 0).click()
      await expect(hexCell(room.player1.page, 2, 0)).toHaveAttribute('data-visible-to-player', 'true')
      await room.player1.page.waitForTimeout(500)

      const { wire, hexCellRows } = await capture.stop()

      // The field name never appears on the wire, in any REST body or ws frame.
      for (const payload of wire) {
        expect(payload, `gm_markers leaked in: ${payload.slice(0, 200)}`).not.toContain('gm_markers')
      }

      // The revealed cell reached the player without its gm_markers.
      const revealed = hexCellRows.find((c) => c.q === 0 && c.r === 0)
      expect(revealed, 'player never received the revealed cell').toBeTruthy()
      expect(revealed).not.toHaveProperty('gm_markers')
      expect(revealed.revealed).toBe(true)

      // The hidden cell reached the player as a sentinel: no content, no gm_markers.
      const hidden = hexCellRows.find((c) => c.q === 1 && c.r === 0)
      expect(hidden, 'hidden cell should arrive as a sentinel under reveal-all').toBeTruthy()
      expect(hidden.revealed).toBe(false)
      expect(hidden).not.toHaveProperty('gm_markers')
      expect(hidden).not.toHaveProperty('terrain_type')
      expect(hidden).not.toHaveProperty('label')
    } finally {
      await room.close()
    }
  })
})
