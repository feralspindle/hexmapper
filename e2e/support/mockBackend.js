const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' }
const BACKEND_PATH = /^\/(api|auth\/v1|rest\/v1|storage\/v1|realtime\/v1)(\/|$)/

export const MOCK_USER = {
  id: '00000000-0000-4000-8000-000000000001',
  aud: 'authenticated',
  role: 'authenticated',
  email: 'mock-gm@example.test',
  app_metadata: { provider: 'email' },
  user_metadata: { full_name: 'Mock GM' },
  created_at: '2026-01-01T00:00:00Z',
}

function fakeJwt() {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url')
  const exp = Math.floor(Date.now() / 1000) + 3600
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: MOCK_USER.id, role: 'authenticated', exp })}.mock`
}

function sessionRow(sessionId) {
  return {
    id: sessionId,
    name: 'Mock Campaign',
    owner_id: MOCK_USER.id,
    play_mode: 'gm',
    hex_mode: 'blank',
    active_map_id: null,
  }
}

function respond(url, method, { sessionId, tables }) {
  if (url.pathname.endsWith('/auth/v1/token')) {
    return {
      access_token: fakeJwt(),
      refresh_token: 'mock-refresh',
      token_type: 'bearer',
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: MOCK_USER,
    }
  }
  if (url.pathname.endsWith('/auth/v1/user')) return MOCK_USER
  if (url.pathname.endsWith(`/sessions/${sessionId}/join`)) return sessionRow(sessionId)
  if (url.pathname.includes('/rest/v1/sessions')) return [sessionRow(sessionId)]
  if (url.pathname.includes('/storage/v1/object/sign/')) {
    return [{ path: 'mock.png', signedURL: '/object/sign/mock.png', error: null }]
  }
  const table = url.pathname.match(/\/rest\/v1\/([^/]+)/)?.[1]
  if (table && tables[table]) return tables[table]
  return method === 'GET' || table ? [] : {}
}

// the map views need a signed-in user and a campaign. this answers every backend
// call inside the browser, so nothing leaves the machine whatever
// VITE_SUPABASE_URL the app was built with
export async function mockBackend(page, { appUrl, sessionId, tables = {} }) {
  const appOrigin = new URL(appUrl).origin
  await page.routeWebSocket(
    (url) => /\/realtime\/v1\//.test(url.pathname),
    () => {},
  )
  await page.route('**/*', (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (url.origin === appOrigin && !BACKEND_PATH.test(url.pathname)) return route.continue()
    return route.fulfill({
      status: 200,
      headers: CORS,
      contentType: 'application/json',
      body: JSON.stringify(respond(url, request.method(), { sessionId, tables })),
    })
  })
}
