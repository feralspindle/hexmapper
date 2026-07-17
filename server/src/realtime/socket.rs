use std::time::{Duration, Instant};

use axum::Router;
use axum::extract::ws::{Message, WebSocket};
use axum::extract::{State, WebSocketUpgrade};
use axum::http::{HeaderMap, StatusCode, header::ORIGIN};
use axum::response::{IntoResponse, Response};
use axum::routing::get;
use futures_util::{SinkExt, StreamExt};
use tokio::sync::mpsc;
use uuid::Uuid;

use super::protocol::{ClientMessage, ServerMessage};
use crate::auth::jwt;
use crate::authz;
use crate::state::AppState;

const AUTH_TIMEOUT: Duration = Duration::from_secs(5);
const CLIENT_STALE_TIMEOUT: Duration = Duration::from_secs(75);
const SEND_TIMEOUT: Duration = Duration::from_secs(5);
const OUTBOUND_CAPACITY: usize = 256;
const INBOUND_CAPACITY: usize = 64;
const MAX_FRAME_BYTES: usize = 64 * 1024;
const MAX_PRESENCE_PAYLOAD_BYTES: usize = 8 * 1024;
// Cursor broadcasts are rAF-throttled (~60/s); the refill leaves 2x headroom
// so the bucket only empties on a client pumping messages faster than any
// real flow.
const INBOUND_BURST: f64 = 240.0;
const INBOUND_REFILL_PER_SEC: f64 = 120.0;

// Token bucket over inbound frames. A connection that overruns it gets
// closed rather than throttled: silently dropping messages desyncs the
// client, and a well-behaved client never gets near the refill rate.
struct InboundRateLimit {
    tokens: f64,
    refilled_at: Instant,
}

impl InboundRateLimit {
    fn new(now: Instant) -> Self {
        Self {
            tokens: INBOUND_BURST,
            refilled_at: now,
        }
    }

    fn allow(&mut self, now: Instant) -> bool {
        let elapsed = now.duration_since(self.refilled_at).as_secs_f64();
        self.tokens = (self.tokens + elapsed * INBOUND_REFILL_PER_SEC).min(INBOUND_BURST);
        self.refilled_at = now;
        if self.tokens < 1.0 {
            return false;
        }
        self.tokens -= 1.0;
        true
    }
}

pub fn router() -> Router<AppState> {
    Router::new().route("/realtime", get(upgrade))
}

async fn upgrade(
    State(state): State<AppState>,
    headers: HeaderMap,
    ws: WebSocketUpgrade,
) -> Response {
    let ip = client_ip(&headers);
    let origin_matches = headers
        .get(ORIGIN)
        .and_then(|value| value.to_str().ok())
        .is_some_and(|origin| state.allows_origin(origin));
    if !origin_matches {
        metrics::counter!("realtime_upgrade_rejections_total", "reason" => "origin").increment(1);
        tracing::warn!(%ip, "realtime upgrade rejected: bad origin");
        return StatusCode::FORBIDDEN.into_response();
    }
    ws.max_message_size(MAX_FRAME_BYTES)
        .on_upgrade(move |socket| handle_socket(socket, state, ip))
}

// Cloudflare fronts Caddy, so the socket's peer address is always an edge or proxy
// IP; CF-Connecting-IP carries the real client and only Cloudflare can reach the
// origin to set it. X-Forwarded-For is the non-Cloudflare (staging/direct) fallback.
fn client_ip(headers: &HeaderMap) -> String {
    headers
        .get("cf-connecting-ip")
        .or_else(|| headers.get("x-forwarded-for"))
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.split(',').next())
        .map(|value| value.trim().to_string())
        .unwrap_or_else(|| "unknown".to_string())
}

async fn handle_socket(socket: WebSocket, state: AppState, ip: String) {
    let (mut sink, mut stream) = socket.split();
    let auth = tokio::time::timeout(AUTH_TIMEOUT, stream.next()).await;
    let Some(Ok(Message::Text(text))) = auth.ok().flatten() else {
        metrics::counter!("realtime_auth_failures_total", "reason" => "missing_frame").increment(1);
        tracing::warn!(%ip, "realtime auth failed: missing frame");
        return;
    };
    let Ok(ClientMessage::Authenticate {
        token,
        client_id: _client_id,
    }) = serde_json::from_str(&text)
    else {
        metrics::counter!("realtime_auth_failures_total", "reason" => "invalid_frame").increment(1);
        tracing::warn!(%ip, "realtime auth failed: invalid frame");
        return;
    };
    let claims = match jwt::verify(&token, &state.jwks()) {
        Ok(claims) => claims,
        Err(error) => {
            let expired = matches!(
                error.kind(),
                jsonwebtoken::errors::ErrorKind::ExpiredSignature
            );
            let reason = if expired {
                "token_expired"
            } else {
                "invalid_token"
            };
            metrics::counter!("realtime_auth_failures_total", "reason" => reason).increment(1);
            tracing::warn!(%ip, reason, "realtime auth failed: token rejected");
            let error = ServerMessage::Error {
                request_id: None,
                code: reason.to_string(),
                message: if expired {
                    "Access token expired; refresh the session and reconnect".to_string()
                } else {
                    "Token verification failed".to_string()
                },
            };
            let _ = send_json(&mut sink, &error).await;
            return;
        }
    };

    let connection_id = Uuid::new_v4();
    let (tx, mut rx) = mpsc::channel(OUTBOUND_CAPACITY);
    let (close_tx, mut close_rx) = mpsc::channel(1);
    let registered = state
        .realtime()
        .register(
            connection_id,
            claims.sub,
            claims.display_name(),
            claims.exp,
            tx.clone(),
            close_tx,
        )
        .await;
    if !registered {
        metrics::counter!("realtime_auth_failures_total", "reason" => "connection_limit")
            .increment(1);
        tracing::warn!(user_id = %claims.sub, %ip, "realtime auth failed: connection limit");
        let error = ServerMessage::Error {
            request_id: None,
            code: "connection_limit".to_string(),
            message: "Too many concurrent realtime connections for this account".to_string(),
        };
        let _ = send_json(&mut sink, &error).await;
        return;
    }
    metrics::gauge!("realtime_connections").increment(1.0);
    let user_id = claims.sub;
    let connected_at = Instant::now();
    tracing::info!(%connection_id, %user_id, %ip, "realtime client connected");

    let ready = ServerMessage::Ready {
        connection_id,
        heartbeat_seconds: 25,
    };
    if send_json(&mut sink, &ready).await.is_err() {
        state.realtime().remove(connection_id).await;
        metrics::gauge!("realtime_connections").decrement(1.0);
        metrics::counter!("realtime_disconnects_total", "reason" => "ready_send").increment(1);
        tracing::info!(%connection_id, %user_id, %ip, "realtime client disconnected before ready");
        return;
    }

    // Client messages are handled on their own sequential task so a slow
    // subscribe (two authz queries) can't stall the outbound drain below —
    // a full outbound queue gets this connection kicked as a slow consumer.
    // One task per connection keeps subscribe→publish ordering intact.
    let (inbound_tx, mut inbound_rx) = mpsc::channel::<ClientMessage>(INBOUND_CAPACITY);
    let inbound_state = state.clone();
    let inbound_task = tokio::spawn(async move {
        while let Some(message) = inbound_rx.recv().await {
            handle_client_message(connection_id, message, &inbound_state).await;
        }
    });

    // interval() fires its first tick immediately, which would run the expiry
    // check in the same instant the token was just verified — a token expiring
    // in that exact second would get ready then killed (issue #25). Start the
    // schedule one period out instead.
    let mut heartbeat = tokio::time::interval_at(
        tokio::time::Instant::now() + Duration::from_secs(25),
        Duration::from_secs(25),
    );
    let mut last_pong = Instant::now();
    let mut rate_limit = InboundRateLimit::new(Instant::now());
    let reason = loop {
        tokio::select! {
            outbound = rx.recv() => {
                let Some(outbound) = outbound else { break "hub_removed" };
                if send_json_bounded(&mut sink, &outbound).await.is_err() { break "send_failed"; }
            }
            kick = close_rx.recv() => {
                let reason = kick.unwrap_or("hub_removed");
                send_farewell(&mut sink, reason).await;
                break reason;
            }
            inbound = stream.next() => {
                match inbound {
                    Some(Ok(Message::Text(text))) => {
                        if !rate_limit.allow(Instant::now()) {
                            metrics::counter!("realtime_rate_limit_kicks_total").increment(1);
                            send_farewell(&mut sink, "rate_limited").await;
                            break "rate_limited";
                        }
                        if text.len() > MAX_FRAME_BYTES {
                            send_farewell(&mut sink, "frame_too_large").await;
                            break "frame_too_large";
                        }
                        if let Ok(message) = serde_json::from_str::<ClientMessage>(&text) {
                            if inbound_tx.try_send(message).is_err() {
                                metrics::counter!("realtime_inbound_dropped_total").increment(1);
                                send_error(&tx, None, "server_busy", "Too many pending messages; message dropped").await;
                            }
                        } else {
                            send_error(&tx, None, "invalid_message", "Invalid realtime message").await;
                        }
                    }
                    Some(Ok(Message::Pong(_))) => last_pong = Instant::now(),
                    Some(Ok(Message::Close(frame))) => {
                        if let Some(frame) = frame {
                            tracing::info!(
                                %connection_id,
                                code = frame.code,
                                reason = %frame.reason,
                                "realtime client sent close frame",
                            );
                        }
                        break "client_close";
                    }
                    None => break "stream_end",
                    Some(Err(_)) => break "socket_error",
                    _ => {}
                }
            }
            _ = heartbeat.tick() => {
                if state.realtime().expired(connection_id).await {
                    send_farewell(&mut sink, "token_expired").await;
                    break "token_expired";
                }
                if let Err(reason) = revalidate_subscriptions(connection_id, &state).await {
                    send_farewell(&mut sink, reason).await;
                    break reason;
                }
                if last_pong.elapsed() > CLIENT_STALE_TIMEOUT {
                    send_farewell(&mut sink, "pong_timeout").await;
                    break "pong_timeout";
                }
                let heartbeat = ServerMessage::Heartbeat { server_time_ms: chrono::Utc::now().timestamp_millis() };
                if send_json_bounded(&mut sink, &heartbeat).await.is_err() { break "heartbeat_send"; }
                if !matches!(
                    tokio::time::timeout(
                        SEND_TIMEOUT,
                        sink.send(Message::Ping(Vec::new().into())),
                    )
                    .await,
                    Ok(Ok(()))
                ) {
                    break "heartbeat_send";
                }
            }
        }
    };

    inbound_task.abort();
    state.realtime().remove(connection_id).await;
    metrics::gauge!("realtime_connections").decrement(1.0);
    metrics::counter!("realtime_disconnects_total", "reason" => reason).increment(1);
    tracing::info!(
        %connection_id,
        %user_id,
        %ip,
        reason,
        duration_secs = connected_at.elapsed().as_secs(),
        "realtime client disconnected",
    );
}

async fn revalidate_subscriptions(
    connection_id: Uuid,
    state: &AppState,
) -> Result<(), &'static str> {
    let Some((user_id, session_ids)) = state.realtime().subscription_identity(connection_id).await
    else {
        return Err("hub_removed");
    };
    let roles = match authz::authorized_session_roles(state.pool(), user_id, &session_ids).await {
        Ok(roles) => roles.into_iter().collect(),
        Err(error) => {
            tracing::warn!(%error, %connection_id, "realtime membership revalidation failed");
            return Err("authz_revalidation");
        }
    };
    state
        .realtime()
        .reconcile_subscriptions(connection_id, &roles)
        .await;
    Ok(())
}

// Best-effort last frame so the client can log why the server hung up; the codes
// mirror the reason labels on realtime_disconnects_total.
async fn send_farewell(
    sink: &mut futures_util::stream::SplitSink<WebSocket, Message>,
    reason: &str,
) {
    let message = match reason {
        "token_expired" => "Access token expired; refresh the session and reconnect",
        "slow_consumer" => "Client is not keeping up with realtime messages; reconnect",
        "server_restart" => "Realtime service is restarting; reconnect",
        "frame_too_large" => "Message exceeds the frame size limit",
        "pong_timeout" => "No pong received; connection presumed dead",
        "authz_revalidation" => "Session membership could not be revalidated; reconnect",
        "identity_changed" => "Token subject changed; reconnect as the new account",
        "rate_limited" => "Too many realtime messages; connection closed",
        _ => "Connection closed by server",
    };
    let _ = send_json_bounded(
        sink,
        &ServerMessage::Error {
            request_id: None,
            code: reason.to_string(),
            message: message.to_string(),
        },
    )
    .await;
}

async fn send_json(
    sink: &mut futures_util::stream::SplitSink<WebSocket, Message>,
    message: &ServerMessage,
) -> Result<(), axum::Error> {
    let text = serde_json::to_string(message).expect("server realtime messages serialize");
    sink.send(Message::Text(text.into())).await
}

async fn send_json_bounded(
    sink: &mut futures_util::stream::SplitSink<WebSocket, Message>,
    message: &ServerMessage,
) -> Result<(), ()> {
    tokio::time::timeout(SEND_TIMEOUT, send_json(sink, message))
        .await
        .map_err(|_| ())?
        .map_err(|_| ())
}

async fn send_error(
    tx: &mpsc::Sender<ServerMessage>,
    request_id: Option<String>,
    code: &str,
    message: &str,
) {
    let _ = tx.try_send(ServerMessage::Error {
        request_id,
        code: code.to_string(),
        message: message.to_string(),
    });
}

async fn handle_client_message(connection_id: Uuid, message: ClientMessage, state: &AppState) {
    match message {
        ClientMessage::Authenticate { .. } => {}
        ClientMessage::Probe { nonce } => {
            if let Some(tx) = state.realtime().sender(connection_id).await {
                let _ = tx.try_send(ServerMessage::Pong { nonce });
            }
        }
        ClientMessage::Reauthenticate { token } => {
            if let Ok(claims) = jwt::verify(&token, &state.jwks()) {
                state
                    .realtime()
                    .refresh_identity(connection_id, claims.sub, claims.display_name(), claims.exp)
                    .await;
            } else if let Some(tx) = state.realtime().sender(connection_id).await {
                send_error(&tx, None, "unauthorized", "Token refresh failed").await;
            }
        }
        ClientMessage::Subscribe {
            request_id,
            session_id,
        } => {
            let Some((user_id, tx)) = state.realtime().identity(connection_id).await else {
                return;
            };
            let member = authz::is_session_member(state.pool(), user_id, session_id)
                .await
                .unwrap_or(false);
            if !member {
                send_error(&tx, request_id, "forbidden", "Session membership required").await;
                return;
            }
            let is_gm = authz::is_session_gm(state.pool(), user_id, session_id)
                .await
                .unwrap_or(false);
            if state
                .realtime()
                .subscribe(connection_id, session_id, is_gm)
                .await
            {
                let _ = tx.try_send(ServerMessage::Subscribed {
                    request_id,
                    session_id,
                });
            } else {
                send_error(
                    &tx,
                    request_id,
                    "subscription_limit",
                    "Too many session subscriptions",
                )
                .await;
            }
        }
        ClientMessage::Unsubscribe {
            request_id,
            session_id,
        } => {
            if let Some(tx) = state.realtime().sender(connection_id).await {
                state
                    .realtime()
                    .unsubscribe(connection_id, session_id)
                    .await;
                let _ = tx.try_send(ServerMessage::Unsubscribed {
                    request_id,
                    session_id,
                });
            }
        }
        ClientMessage::Publish {
            session_id,
            channel,
            event,
            payload,
        } => {
            if !valid_channel(&channel)
                || !allowed_broadcast(&event)
                || serde_json::to_vec(&payload).map_or(true, |p| p.len() > 16 * 1024)
            {
                if let Some(tx) = state.realtime().sender(connection_id).await {
                    send_error(&tx, None, "invalid_broadcast", "Broadcast was rejected").await;
                }
                return;
            }
            state
                .realtime()
                .publish(connection_id, session_id, channel, event, payload)
                .await;
        }
        ClientMessage::PresenceTrack {
            session_id,
            channel,
            payload,
        } => {
            if !valid_channel(&channel)
                || serde_json::to_vec(&payload).map_or(true, |p| p.len() > MAX_PRESENCE_PAYLOAD_BYTES)
            {
                if let Some(tx) = state.realtime().sender(connection_id).await {
                    send_error(&tx, None, "invalid_presence", "Presence update was rejected").await;
                }
                return;
            }
            let tracked = state
                .realtime()
                .track_presence(connection_id, session_id, channel, payload)
                .await;
            if !tracked {
                metrics::counter!("realtime_presence_rejections_total", "reason" => "channel_limit")
                    .increment(1);
                if let Some(tx) = state.realtime().sender(connection_id).await {
                    send_error(&tx, None, "presence_limit", "Too many presence channels").await;
                }
            }
        }
        ClientMessage::PresenceUntrack {
            session_id,
            channel,
        } => {
            state
                .realtime()
                .untrack_presence(connection_id, session_id, &channel)
                .await;
        }
    }
}

fn valid_channel(channel: &str) -> bool {
    !channel.is_empty()
        && channel.len() <= 160
        && channel
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, ':' | '-' | '_'))
}

fn allowed_broadcast(event: &str) -> bool {
    matches!(
        event,
        "editing"
            | "done"
            | "loot_toast"
            | "luck_spent"
            | "character_updated"
            | "initiative_cleared"
            | "gm_initiative_set"
            | "active_character_changed"
            | "refresh"
            | "party"
            | "undo_push"
            | "room_upsert"
            | "room_delete"
            | "corridor_upsert"
            | "corridor_delete"
            | "cursor"
            | "dungeon_entered"
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn broadcast_allowlist_covers_the_party_follow_event() {
        assert!(allowed_broadcast("dungeon_entered"));
        assert!(!allowed_broadcast("made_up_event"));
    }

    #[test]
    fn rate_limit_allows_sustained_cursor_traffic_but_kicks_a_flood() {
        let start = Instant::now();
        let mut limit = InboundRateLimit::new(start);

        // 60/s for 10 simulated seconds: always allowed
        for tick in 0..600 {
            let now = start + Duration::from_millis(tick * 1000 / 60);
            assert!(limit.allow(now), "cursor-rate message {tick} was limited");
        }

        // a burst beyond capacity with no time passing gets cut off
        let now = start + Duration::from_secs(10);
        let allowed = (0..1000).filter(|_| limit.allow(now)).count();
        assert!(allowed < 1000);

        // and after a quiet second the budget refills
        assert!(limit.allow(now + Duration::from_secs(1)));
    }

    #[test]
    fn client_ip_prefers_cloudflare_header_and_takes_first_forwarded_hop() {
        let mut headers = HeaderMap::new();
        assert_eq!(client_ip(&headers), "unknown");

        headers.insert(
            "x-forwarded-for",
            "203.0.113.7, 172.68.1.1".parse().unwrap(),
        );
        assert_eq!(client_ip(&headers), "203.0.113.7");

        headers.insert("cf-connecting-ip", "198.51.100.9".parse().unwrap());
        assert_eq!(client_ip(&headers), "198.51.100.9");
    }
}
