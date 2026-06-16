import { initializeFaro, getWebInstrumentations, UserActionInstrumentation } from '@grafana/faro-web-sdk'
import { TracingInstrumentation } from '@grafana/faro-web-tracing'

const FARO_URL = import.meta.env.VITE_FARO_URL

let faro = null

export function initFaro() {
  if (!FARO_URL || faro) return faro

  faro = initializeFaro({
    url: FARO_URL,
    app: {
      name: 'hex_map',
      version: import.meta.env.VITE_APP_VERSION || 'dev',
      environment: import.meta.env.VITE_APP_ENV || 'development',
    },
    instrumentations: [
      ...getWebInstrumentations(),
      new UserActionInstrumentation(),
      // Browser OTel tracing: emits spans to the Faro collector and propagates the
      // W3C traceparent on fetches — same-origin /api is covered by default, so the
      // Rust server can continue the same trace.
      new TracingInstrumentation(),
    ],
  })
  return faro
}

// Associate frontend errors/sessions with the user (id only — keep PII out of
// frontend telemetry; user_id is the forensic join key back to the event log).
export function setFaroUser(user) {
  if (!faro) return
  if (user?.id) faro.api.setUser({ id: user.id })
  else faro.api.resetUser()
}
