// fake supabase auth for the local verify env: a static jwks endpoint plus
// jwt minting, sharing one hs256 secret persisted in the env dir so tokens
// survive restarts. the server only ever asks for the jwks.
//
//   node verify-auth.mjs serve [port]        # blocks; verify-env.sh daemonizes it
//   node verify-auth.mjs mint <sub> [name]   # prints a bearer token
import http from 'node:http'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const HOME = process.env.HEXMAP_VERIFY_HOME ?? `${process.env.HOME}/.cache/hexmap-verify`
const KID = 'hexmap-verify'
const b64u = (b) => Buffer.from(b).toString('base64url')

function secret() {
  const file = path.join(HOME, 'auth-secret')
  if (!fs.existsSync(file)) {
    fs.mkdirSync(HOME, { recursive: true })
    fs.writeFileSync(file, crypto.randomBytes(32).toString('hex'), { mode: 0o600 })
  }
  return Buffer.from(fs.readFileSync(file, 'utf8').trim(), 'hex')
}

function mint(sub, name) {
  const header = b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT', kid: KID }))
  const claims = b64u(JSON.stringify({
    sub,
    exp: Math.floor(Date.now() / 1000) + 12 * 3600,
    aud: 'authenticated',
    role: 'authenticated',
    user_metadata: { display_name: name ?? 'Verifier' },
  }))
  const sig = crypto.createHmac('sha256', secret()).update(`${header}.${claims}`).digest('base64url')
  return `${header}.${claims}.${sig}`
}

const [, , cmd, ...args] = process.argv

if (cmd === 'mint') {
  if (!args[0]) { console.error('usage: verify-auth.mjs mint <user-uuid> [display name]'); process.exit(1) }
  console.log(mint(args[0], args[1]))
} else if (cmd === 'serve') {
  const port = Number(args[0] ?? 55321)
  const jwks = JSON.stringify({ keys: [{ kty: 'oct', kid: KID, alg: 'HS256', k: b64u(secret()) }] })
  http.createServer((req, res) => {
    if (req.url === '/auth/v1/.well-known/jwks.json') {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(jwks)
    } else {
      res.writeHead(404); res.end()
    }
  }).listen(port, () => console.log(`verify-auth jwks on :${port}`))
} else {
  console.error('usage: verify-auth.mjs serve [port] | mint <user-uuid> [display name]')
  process.exit(1)
}
