import { realtime } from './realtime.js'

// Owns the realtime lifecycle every session-scoped store used to hand-roll:
// a generation counter that invalidates in-flight fetches once close()/begin()
// has moved on, refresh on first SUBSCRIBED, refresh on reconnect, and channel
// teardown. A refresh passed to open() is only ever invoked while its
// generation is current, and it receives that generation so post-await writes
// can check isCurrent() before landing in state.
export function createSessionChannel() {
  let channels = []
  let currentKey = null
  let generation = 0

  function close() {
    generation += 1
    currentKey = null
    for (const channel of channels) realtime.removeChannel(channel)
    channels = []
  }

  function begin(key) {
    close()
    currentKey = key
    return generation
  }

  function isCurrent(gen) {
    return gen === generation
  }

  function open(name, { sessionId, config, refresh } = {}, configure = null) {
    const gen = generation
    const guardedRefresh = refresh
      ? () => { if (isCurrent(gen)) return refresh(gen) }
      : null
    let channel = realtime.channel(name, {
      sessionId,
      ...(config ? { config } : {}),
      ...(guardedRefresh ? { onReconnect: guardedRefresh } : {}),
    })
    if (configure) channel = configure(channel) ?? channel
    let subscribedRefreshed = false
    channel.subscribe(guardedRefresh
      ? status => {
          if (status !== 'SUBSCRIBED' || subscribedRefreshed) return
          subscribedRefreshed = true
          void guardedRefresh()
        }
      : undefined)
    channels.push(channel)
    return channel
  }

  return {
    get key() { return currentKey },
    get generation() { return generation },
    begin,
    open,
    close,
    isCurrent,
  }
}
