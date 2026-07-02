export const E2E_ACCOUNT_ENV = [
  'E2E_GM_EMAIL',
  'E2E_GM_PASSWORD',
  'E2E_PLAYER1_EMAIL',
  'E2E_PLAYER1_PASSWORD',
  'E2E_PLAYER2_EMAIL',
  'E2E_PLAYER2_PASSWORD',
]

export function missingE2EAccountEnv() {
  return E2E_ACCOUNT_ENV.filter((name) => !process.env[name])
}

export function e2eAccounts() {
  return {
    gm: {
      email: process.env.E2E_GM_EMAIL,
      password: process.env.E2E_GM_PASSWORD,
    },
    player1: {
      email: process.env.E2E_PLAYER1_EMAIL,
      password: process.env.E2E_PLAYER1_PASSWORD,
    },
    player2: {
      email: process.env.E2E_PLAYER2_EMAIL,
      password: process.env.E2E_PLAYER2_PASSWORD,
    },
  }
}

export function uniqueCampaignName(prefix) {
  return `${prefix} ${new Date().toISOString()} ${Math.random().toString(36).slice(2, 8)}`
}
