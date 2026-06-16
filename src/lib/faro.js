import { initializeFaro, getWebInstrumentations, UserActionInstrumentation } from '@grafana/faro-web-sdk'
import { TracingInstrumentation } from '@grafana/faro-web-tracing'
import { installAutoUserActions } from './faroUserActions'

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
  installAutoUserActions(faro)
  return faro
}

// Associate frontend errors/sessions with the user: id (the forensic join key
// back to the event log) plus the display name so the Grafana UI is readable.
// Email and other PII are deliberately still kept out of frontend telemetry.
export function setFaroUser(user, displayName) {
  if (!faro) return
  if (user?.id) faro.api.setUser({ id: user.id, fullName: displayName ?? undefined })
  else faro.api.resetUser()
}
