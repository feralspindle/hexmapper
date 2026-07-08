use std::collections::{HashMap, HashSet};
use std::sync::Arc;
use std::time::{Duration, Instant};

use axum::Router;
use axum::extract::ws::{Message, WebSocket};
use axum::extract::{State, WebSocketUpgrade};
use axum::http::{HeaderMap, StatusCode, header::ORIGIN};
use axum::response::{IntoResponse, Response};
use axum::routing::get;
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sqlx::postgres::PgListener;
use tokio::sync::{Mutex, mpsc};
use uuid::Uuid;

use crate::auth::jwt;
use crate::authz;
use crate::domains::hex::visibility as hex_visibility;
use crate::state::AppState;

const AUTH_TIMEOUT: Duration = Duration::from_secs(5);
const CLIENT_STALE_TIMEOUT: Duration = Duration::from_secs(75);
const SEND_TIMEOUT: Duration = Duration::from_secs(5);
const OUTBOUND_CAPACITY: usize = 256;
const INBOUND_CAPACITY: usize = 64;
const MAX_FRAME_BYTES: usize = 64 * 1024;
const MAX_SESSIONS: usize = 8;

#[derive(Clone, Default)]
pub struct RealtimeHub(Arc<Mutex<HubState>>);

#[derive(Default)]
struct HubState {
    clients: HashMap<Uuid, Client>,
}

struct Client {
    user_id: Uuid,
    display_name: String,
    expires_at: usize,
    tx: mpsc::Sender<ServerMessage>,
    close: mpsc::Sender<&'static str>,
    sessions: HashMap<Uuid, bool>,
    presence: HashMap<String, TrackedPresence>,
}

struct TrackedPresence {
    session_id: Uuid,
    payload: Value,
}

#[derive(Debug, Serialize, Clone)]
#[serde(tag = "type", rename_all = "snake_case")]
enum ServerMessage {
    Ready {
        connection_id: Uuid,
        heartbeat_seconds: u64,
    },
    Heartbeat {
        server_time_ms: i64,
    },
    Pong {
        nonce: String,
    },
    Subscribed {
        request_id: Option<String>,
        session_id: Uuid,
    },
    Unsubscribed {
        request_id: Option<String>,
        session_id: Uuid,
    },
    PostgresChange {
        event_id: i64,
        session_id: Uuid,
        aggregate_type: String,
        aggregate_id: Uuid,
        event: String,
        payload: Value,
        source_client: Option<String>,
    },
    Broadcast {
        channel: String,
        event: String,
        payload: Value,
        source_connection_id: Uuid,
    },
    PresenceSnapshot {
        channel: String,
        presences: Vec<Value>,
    },
    Error {
        request_id: Option<String>,
        code: String,
        message: String,
    },
}

#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum ClientMessage {
    Authenticate {
        token: String,
        client_id: Option<String>,
    },
    Reauthenticate {
        token: String,
    },
    Probe {
        nonce: String,
    },
    Subscribe {
        request_id: Option<String>,
        session_id: Uuid,
    },
    Unsubscribe {
        request_id: Option<String>,
        session_id: Uuid,
    },
    Publish {
        session_id: Uuid,
        channel: String,
        event: String,
        payload: Value,
    },
    PresenceTrack {
        session_id: Uuid,
        channel: String,
        payload: Value,
    },
    PresenceUntrack {
        session_id: Uuid,
        channel: String,
    },
}

#[derive(Debug, sqlx::FromRow)]
struct EventRow {
    id: i64,
    aggregate_type: String,
    aggregate_id: Uuid,
    session_id: Option<Uuid>,
    event_type: String,
    payload: Value,
    metadata: Value,
    created_at: chrono::DateTime<chrono::Utc>,
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
    state
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
            if valid_channel(&channel) {
                state
                    .realtime()
                    .track_presence(connection_id, session_id, channel, payload)
                    .await;
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

impl RealtimeHub {
    async fn register(
        &self,
        id: Uuid,
        user_id: Uuid,
        display_name: String,
        expires_at: usize,
        tx: mpsc::Sender<ServerMessage>,
        close: mpsc::Sender<&'static str>,
    ) {
        self.0.lock().await.clients.insert(
            id,
            Client {
                user_id,
                display_name,
                expires_at,
                tx,
                close,
                sessions: HashMap::new(),
                presence: HashMap::new(),
            },
        );
    }

    async fn remove(&self, id: Uuid) {
        let channels = {
            let mut hub = self.0.lock().await;
            hub.clients
                .remove(&id)
                .map(|c| c.presence.keys().cloned().collect::<Vec<_>>())
                .unwrap_or_default()
        };
        for channel in channels {
            self.broadcast_presence(&channel).await;
        }
    }

    async fn sender(&self, id: Uuid) -> Option<mpsc::Sender<ServerMessage>> {
        self.0.lock().await.clients.get(&id).map(|c| c.tx.clone())
    }

    async fn identity(&self, id: Uuid) -> Option<(Uuid, mpsc::Sender<ServerMessage>)> {
        self.0
            .lock()
            .await
            .clients
            .get(&id)
            .map(|c| (c.user_id, c.tx.clone()))
    }

    async fn subscription_identity(&self, id: Uuid) -> Option<(Uuid, Vec<Uuid>)> {
        self.0.lock().await.clients.get(&id).map(|client| {
            (
                client.user_id,
                client.sessions.keys().copied().collect::<Vec<_>>(),
            )
        })
    }

    async fn refresh_identity(
        &self,
        id: Uuid,
        user_id: Uuid,
        display_name: String,
        expires_at: usize,
    ) {
        if let Some(client) = self.0.lock().await.clients.get_mut(&id) {
            if client.user_id == user_id {
                client.display_name = display_name;
                client.expires_at = expires_at;
            }
        }
    }

    // Must stay in lockstep with `jwt::verify`'s leeway (see EXP_LEEWAY_SECONDS):
    // this check must never kill a token that verification would still accept.
    async fn expired(&self, id: Uuid) -> bool {
        let now = chrono::Utc::now().timestamp().max(0) as usize;
        self.0.lock().await.clients.get(&id).is_none_or(|client| {
            client
                .expires_at
                .saturating_add(jwt::EXP_LEEWAY_SECONDS as usize)
                <= now
        })
    }

    async fn subscribe(&self, id: Uuid, session_id: Uuid, is_gm: bool) -> bool {
        let mut hub = self.0.lock().await;
        let Some(client) = hub.clients.get_mut(&id) else {
            return false;
        };
        if client.sessions.len() >= MAX_SESSIONS && !client.sessions.contains_key(&session_id) {
            return false;
        }
        client.sessions.insert(session_id, is_gm);
        metrics::counter!("realtime_subscriptions_total").increment(1);
        true
    }

    async fn unsubscribe(&self, id: Uuid, session_id: Uuid) {
        if let Some(client) = self.0.lock().await.clients.get_mut(&id) {
            client.sessions.remove(&session_id);
        }
    }

    async fn reconcile_subscriptions(&self, id: Uuid, authorized: &HashMap<Uuid, bool>) {
        let (revoked, presence_channels) = {
            let mut hub = self.0.lock().await;
            let Some(client) = hub.clients.get_mut(&id) else {
                return;
            };
            let revoked = client
                .sessions
                .keys()
                .filter(|session_id| !authorized.contains_key(session_id))
                .copied()
                .collect::<HashSet<_>>();

            client.sessions.retain(|session_id, is_gm| {
                let Some(current_is_gm) = authorized.get(session_id) else {
                    return false;
                };
                *is_gm = *current_is_gm;
                true
            });

            let mut presence_channels = Vec::new();
            client.presence.retain(|channel, presence| {
                if revoked.contains(&presence.session_id) {
                    presence_channels.push(channel.clone());
                    false
                } else {
                    true
                }
            });
            for session_id in &revoked {
                let _ = client.tx.try_send(ServerMessage::Unsubscribed {
                    request_id: None,
                    session_id: *session_id,
                });
            }
            (revoked, presence_channels)
        };

        if !revoked.is_empty() {
            metrics::counter!("realtime_subscriptions_revoked_total")
                .increment(revoked.len() as u64);
        }
        for channel in presence_channels {
            self.broadcast_presence(&channel).await;
        }
    }

    async fn publish(
        &self,
        source: Uuid,
        session_id: Uuid,
        channel: String,
        event: String,
        mut payload: Value,
    ) {
        let mut hub = self.0.lock().await;
        let Some(sender) = hub.clients.get(&source) else {
            return;
        };
        let Some(is_gm) = sender.sessions.get(&session_id) else {
            return;
        };
        if matches!(
            event.as_str(),
            "initiative_cleared" | "gm_initiative_set" | "party"
        ) && !*is_gm
        {
            metrics::counter!("realtime_broadcast_rejections_total", "reason" => "gm_required")
                .increment(1);
            return;
        }
        if let Value::Object(object) = &mut payload {
            object.insert("user_id".into(), json!(sender.user_id));
            object.insert("display_name".into(), json!(sender.display_name));
            if matches!(event.as_str(), "cursor" | "active_character_changed") {
                object.insert("userId".into(), json!(sender.user_id));
            }
            if event == "editing" {
                object.insert("name".into(), json!(sender.display_name));
            }
        }
        let mut slow = Vec::new();
        for (id, client) in &hub.clients {
            if client.sessions.contains_key(&session_id) {
                if client
                    .tx
                    .try_send(ServerMessage::Broadcast {
                        channel: channel.clone(),
                        event: event.clone(),
                        payload: payload.clone(),
                        source_connection_id: source,
                    })
                    .is_err()
                {
                    slow.push(*id);
                }
            }
        }
        let mut presence_channels = HashSet::new();
        for id in &slow {
            if let Some(client) = hub.clients.remove(id) {
                presence_channels.extend(client.presence.keys().cloned());
                let _ = client.close.try_send("slow_consumer");
            }
        }
        if !slow.is_empty() {
            metrics::counter!("realtime_slow_consumers_total").increment(slow.len() as u64);
        }
        drop(hub);
        for channel in presence_channels {
            self.broadcast_presence(&channel).await;
        }
    }

    async fn track_presence(
        &self,
        id: Uuid,
        session_id: Uuid,
        channel: String,
        mut payload: Value,
    ) {
        {
            let mut hub = self.0.lock().await;
            let Some(client) = hub.clients.get_mut(&id) else {
                return;
            };
            if !client.sessions.contains_key(&session_id) {
                return;
            }
            if let Value::Object(object) = &mut payload {
                object.insert("user_id".into(), json!(client.user_id));
                object.insert("display_name".into(), json!(client.display_name));
                object.insert("connection_id".into(), json!(id));
            }
            client.presence.insert(
                channel.clone(),
                TrackedPresence {
                    session_id,
                    payload,
                },
            );
        }
        self.broadcast_presence(&channel).await;
    }

    async fn untrack_presence(&self, id: Uuid, session_id: Uuid, channel: &str) {
        let changed = {
            let mut hub = self.0.lock().await;
            hub.clients
                .get_mut(&id)
                .filter(|c| c.sessions.contains_key(&session_id))
                .and_then(|c| c.presence.remove(channel))
                .is_some()
        };
        if changed {
            self.broadcast_presence(channel).await;
        }
    }

    async fn broadcast_presence(&self, channel: &str) {
        loop {
            let mut hub = self.0.lock().await;
            // Deterministic winner per user (highest connection id) so two tabs of
            // the same user don't flap between payloads on every snapshot rebuild.
            let mut by_user = HashMap::<Uuid, (Uuid, Value)>::new();
            for (id, client) in &hub.clients {
                if let Some(presence) = client.presence.get(channel) {
                    match by_user.get_mut(&client.user_id) {
                        Some(entry) if entry.0 > *id => {}
                        Some(entry) => *entry = (*id, presence.payload.clone()),
                        None => {
                            by_user.insert(client.user_id, (*id, presence.payload.clone()));
                        }
                    }
                }
            }
            let presences = by_user
                .into_values()
                .map(|(_, payload)| payload)
                .collect::<Vec<_>>();
            let mut slow = Vec::new();
            for (id, client) in &hub.clients {
                if client.presence.contains_key(channel) {
                    if client
                        .tx
                        .try_send(ServerMessage::PresenceSnapshot {
                            channel: channel.to_string(),
                            presences: presences.clone(),
                        })
                        .is_err()
                    {
                        slow.push(*id);
                    }
                }
            }
            for id in &slow {
                if let Some(client) = hub.clients.remove(id) {
                    let _ = client.close.try_send("slow_consumer");
                }
            }
            if !slow.is_empty() {
                metrics::counter!("realtime_slow_consumers_total").increment(slow.len() as u64);
            }
            if slow.is_empty() {
                return;
            }
        }
    }

    async fn dispatch_event(&self, row: EventRow) {
        let Some(session_id) = row.session_id else {
            return;
        };
        let source_client = row
            .metadata
            .get("client_id")
            .and_then(Value::as_str)
            .map(str::to_string);
        let mut hub = self.0.lock().await;
        let mut slow = Vec::new();
        for (id, client) in &hub.clients {
            let Some(is_gm) = client.sessions.get(&session_id) else {
                continue;
            };
            let Some((event, payload)) = visible_event(&row, *is_gm) else {
                continue;
            };
            let message = ServerMessage::PostgresChange {
                event_id: row.id,
                session_id,
                aggregate_type: row.aggregate_type.clone(),
                aggregate_id: row.aggregate_id,
                event,
                payload,
                source_client: source_client.clone(),
            };
            if client.tx.try_send(message).is_err() {
                slow.push(*id);
            }
        }
        let mut presence_channels = HashSet::new();
        for id in &slow {
            if let Some(client) = hub.clients.remove(id) {
                presence_channels.extend(client.presence.keys().cloned());
                let _ = client.close.try_send("slow_consumer");
            }
        }
        metrics::counter!("realtime_events_dispatched_total", "aggregate" => row.aggregate_type.clone()).increment(1);
        if !slow.is_empty() {
            metrics::counter!("realtime_slow_consumers_total").increment(slow.len() as u64);
        }
        drop(hub);
        for channel in presence_channels {
            self.broadcast_presence(&channel).await;
        }
    }

    pub async fn disconnect_all(&self) {
        let clients = std::mem::take(&mut self.0.lock().await.clients);
        for client in clients.into_values() {
            let _ = client.close.try_send("server_restart");
        }
    }
}

fn visible_event(row: &EventRow, is_gm: bool) -> Option<(String, Value)> {
    if row.aggregate_type != "hex_cell" {
        return Some((row.event_type.clone(), with_event_fields(row)));
    }

    let payload = with_event_fields(row);
    if row.event_type == "hex_cell.deleted" {
        if is_gm {
            return Some(("hex_cell.deleted".into(), payload));
        }
        let mut removal = serde_json::Map::new();
        for key in ["id", "session_id", "map_id", "q", "r"] {
            if let Some(value) = payload.get(key) {
                removal.insert(key.to_string(), value.clone());
            }
        }
        return Some(("hex_cell.deleted".into(), Value::Object(removal)));
    }

    let payload = match hex_visibility::visible_hex_row(payload, is_gm) {
        hex_visibility::VisibleHexRow::Full(payload) => payload,
        hex_visibility::VisibleHexRow::Sentinel(sentinel) => sentinel,
    };
    Some((row.event_type.clone(), payload))
}

fn with_event_fields(row: &EventRow) -> Value {
    let mut payload = row.payload.clone();
    if !payload.is_object() {
        payload = json!({});
    }
    if let Value::Object(object) = &mut payload {
        object
            .entry("id")
            .or_insert_with(|| json!(row.aggregate_id));
        if let Some(session_id) = row.session_id {
            object
                .entry("session_id")
                .or_insert_with(|| json!(session_id));
        }
        object
            .entry("created_at")
            .or_insert_with(|| json!(row.created_at));
        for key in ["user_id", "display_name"] {
            if let Some(value) = row.metadata.get(key) {
                object.entry(key).or_insert_with(|| value.clone());
            }
        }
    }
    payload
}

pub fn spawn_event_listener(database_url: String, state: AppState) {
    tokio::spawn(async move {
        loop {
            match listen(&database_url, &state).await {
                Ok(()) => tracing::warn!("realtime event listener ended"),
                Err(error) => tracing::error!(%error, "realtime event listener failed"),
            }
            state.realtime().disconnect_all().await;
            tokio::time::sleep(Duration::from_secs(2)).await;
        }
    });
}

const EVENT_BURST: &str = "select id, aggregate_type, aggregate_id, session_id, event_type, payload, metadata, created_at from events where id = $1 or id > $2 order by id";
const EVENTS_AFTER: &str = "select id, aggregate_type, aggregate_id, session_id, event_type, payload, metadata, created_at from events where id > $1 order by id";

/// Retries transient query failures so one DB blip doesn't tear down every
/// realtime client (the caller's error path is `disconnect_all`).
async fn retry_query<T, Fut>(
    mut run: impl FnMut() -> Fut,
    what: &'static str,
) -> Result<T, sqlx::Error>
where
    Fut: std::future::Future<Output = Result<T, sqlx::Error>>,
{
    let mut attempt: u32 = 0;
    loop {
        match run().await {
            Ok(value) => return Ok(value),
            Err(error) if attempt < 2 => {
                attempt += 1;
                tracing::warn!(%error, what, attempt, "realtime listener query failed; retrying");
                tokio::time::sleep(Duration::from_millis(100 << attempt)).await;
            }
            Err(error) => return Err(error),
        }
    }
}

async fn dispatch_row(state: &AppState, mut row: EventRow) -> Result<(), sqlx::Error> {
    if row.aggregate_type == "dice_roll" {
        let roll_id = row.aggregate_id;
        if let Some(payload) = retry_query(
            || {
                sqlx::query_scalar::<_, Value>("select to_jsonb(dr) from dice_rolls dr where id = $1")
                    .bind(roll_id)
                    .fetch_optional(state.pool())
            },
            "dice_roll_payload",
        )
        .await?
        {
            row.payload = payload;
        }
    }
    let lag = (chrono::Utc::now() - row.created_at)
        .num_milliseconds()
        .max(0) as f64
        / 1000.0;
    metrics::histogram!("realtime_event_delivery_lag_seconds").record(lag);
    state.realtime().dispatch_event(row).await;
    Ok(())
}

/// Dispatches every event committed after `last_seen`, returning the new high-water
/// mark. Covers NOTIFYs lost while the listener connection was down. An event whose
/// id was assigned before the gap but committed during it can still slip through
/// (id order != commit order); that window is a single in-flight transaction.
async fn catch_up(state: &AppState, last_seen: i64) -> Result<i64, sqlx::Error> {
    let rows = retry_query(
        || {
            sqlx::query_as::<_, EventRow>(EVENTS_AFTER)
                .bind(last_seen)
                .fetch_all(state.pool())
        },
        "events_catch_up",
    )
    .await?;
    let mut max_seen = last_seen;
    let recovered = rows.len();
    for row in rows {
        max_seen = max_seen.max(row.id);
        dispatch_row(state, row).await?;
    }
    if recovered > 0 {
        metrics::counter!("realtime_events_recovered_total").increment(recovered as u64);
        tracing::warn!(recovered, "realtime listener dispatched events missed during reconnect");
    }
    Ok(max_seen)
}

/// bookkeeping for burst dispatch. one NOTIFY triggers a scan that can pull in
/// rows whose own NOTIFYs are still in flight, so remember those ids and skip
/// them when they arrive. every event insert notifies exactly once, so entries
/// drain instead of accumulating.
struct BurstCursor {
    last_seen: i64,
    dispatched_ahead: HashSet<i64>,
}

impl BurstCursor {
    fn new(last_seen: i64) -> Self {
        Self {
            last_seen,
            dispatched_ahead: HashSet::new(),
        }
    }

    /// true if this notification's row still needs fetching, false if it
    /// already went out with an earlier burst scan
    fn needs_fetch(&mut self, id: i64) -> bool {
        !self.dispatched_ahead.remove(&id)
    }

    /// record a row dispatched by the scan for notification `notified_id`
    fn note_dispatched(&mut self, row_id: i64, notified_id: i64) {
        if row_id != notified_id {
            self.dispatched_ahead.insert(row_id);
        }
        self.last_seen = self.last_seen.max(row_id);
    }

    /// notifications for pending ids died with the old connection; catch_up
    /// owns everything past the new mark
    fn reset(&mut self, last_seen: i64) {
        self.last_seen = last_seen;
        self.dispatched_ahead.clear();
    }
}

async fn listen(database_url: &str, state: &AppState) -> Result<(), sqlx::Error> {
    let mut listener = PgListener::connect(database_url).await?;
    listener.listen("hexmap_events").await?;
    let initial: i64 = retry_query(
        || {
            sqlx::query_scalar("select coalesce(max(id), 0) from events")
                .fetch_one(state.pool())
        },
        "max_event_id",
    )
    .await?;
    let mut cursor = BurstCursor::new(initial);
    loop {
        // `try_recv` returns Ok(None) when the connection dropped and was silently
        // re-established — NOTIFYs sent during the gap are lost, so scan the events
        // table forward instead of trusting the stream. `recv` would swallow that
        // signal and clients would go permanently stale.
        match listener.try_recv().await? {
            Some(notification) => {
                let Ok(id) = notification.payload().parse::<i64>() else {
                    continue;
                };
                if !cursor.needs_fetch(id) {
                    continue;
                }
                // a bulk write (the fog brush, mostly) commits hundreds of event
                // rows at once and the trigger NOTIFYs per row. fetching one row
                // per notification meant one db round trip per cell, so players
                // watched a brush stroke reveal cell by cell. scan the whole
                // committed burst on its first notification instead. the id = $1
                // arm covers a row committed out of id order, which the range
                // scan would otherwise skip forever.
                let rows = retry_query(
                    || {
                        sqlx::query_as::<_, EventRow>(EVENT_BURST)
                            .bind(id)
                            .bind(cursor.last_seen)
                            .fetch_all(state.pool())
                    },
                    "event_burst",
                )
                .await?;
                for row in rows {
                    cursor.note_dispatched(row.id, id);
                    dispatch_row(state, row).await?;
                }
            }
            None => {
                metrics::counter!("realtime_listener_reconnects_total").increment(1);
                tracing::warn!("realtime listener reconnected; scanning for missed events");
                let last_seen = catch_up(state, cursor.last_seen).await?;
                cursor.reset(last_seen);
            }
        }
    }
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
    fn player_hex_payload_never_contains_gm_fields() {
        let row = EventRow {
            id: 1,
            aggregate_type: "hex_cell".into(),
            aggregate_id: Uuid::new_v4(),
            session_id: Some(Uuid::new_v4()),
            event_type: "hex_cell.upserted".into(),
            payload: json!({"revealed": true, "q": 1, "r": 2, "gm_markers": [{"secret": true}], "source_client": "tab"}),
            metadata: json!({}),
            created_at: chrono::Utc::now(),
        };
        let (_, payload) = visible_event(&row, false).unwrap();
        assert!(payload.get("gm_markers").is_none());
        assert!(payload.get("source_client").is_none());
    }

    #[test]
    fn hidden_hex_becomes_hidden_sentinel() {
        let row = EventRow {
            id: 1,
            aggregate_type: "hex_cell".into(),
            aggregate_id: Uuid::new_v4(),
            session_id: Some(Uuid::new_v4()),
            event_type: "hex_cell.upserted".into(),
            payload: json!({"revealed": false, "map_id": Uuid::new_v4(), "q": 1, "r": 2, "gm_markers": []}),
            metadata: json!({}),
            created_at: chrono::Utc::now(),
        };
        let (event, payload) = visible_event(&row, false).unwrap();
        assert_eq!(event, "hex_cell.upserted");
        assert_eq!(payload.get("revealed"), Some(&json!(false)));
        assert!(payload.get("gm_markers").is_none());
        assert!(payload.get("id").is_none());
    }

    #[test]
    fn unexplored_hex_is_a_sentinel_for_gm_and_players() {
        let row = EventRow {
            id: 1,
            aggregate_type: "hex_cell".into(),
            aggregate_id: Uuid::new_v4(),
            session_id: Some(Uuid::new_v4()),
            event_type: "hex_cell.upserted".into(),
            payload: json!({
                "revealed": false, "explored": false, "map_id": Uuid::new_v4(),
                "q": 3, "r": 4, "terrain_type": "swamp", "label": "Witch's hut"
            }),
            metadata: json!({}),
            created_at: chrono::Utc::now(),
        };
        for is_gm in [true, false] {
            let (event, payload) = visible_event(&row, is_gm).unwrap();
            assert_eq!(event, "hex_cell.upserted");
            assert_eq!(payload.get("explored"), Some(&json!(false)));
            assert_eq!(payload.get("revealed"), Some(&json!(false)));
            assert!(payload.get("terrain_type").is_none());
            assert!(payload.get("label").is_none());
        }
    }

    #[test]
    fn event_payload_includes_actor_and_timestamp_fields() {
        let user_id = Uuid::new_v4();
        let created_at = chrono::Utc::now();
        let row = EventRow {
            id: 1,
            aggregate_type: "dice_roll".into(),
            aggregate_id: Uuid::new_v4(),
            session_id: Some(Uuid::new_v4()),
            event_type: "dice_roll.rolled".into(),
            payload: json!({"total": 12}),
            metadata: json!({"user_id": user_id, "display_name": "Rook"}),
            created_at,
        };

        let payload = with_event_fields(&row);
        assert_eq!(payload.get("user_id"), Some(&json!(user_id)));
        assert_eq!(payload.get("display_name"), Some(&json!("Rook")));
        assert_eq!(payload.get("created_at"), Some(&json!(created_at)));
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

    #[tokio::test]
    async fn disconnect_all_sends_server_restart_reason() {
        let hub = RealtimeHub::default();
        let connection_id = Uuid::new_v4();
        let (tx, _rx) = mpsc::channel(8);
        let (close, mut close_rx) = mpsc::channel(1);

        hub.register(
            connection_id,
            Uuid::new_v4(),
            "Player".into(),
            usize::MAX,
            tx,
            close,
        )
        .await;
        hub.disconnect_all().await;

        assert_eq!(close_rx.recv().await, Some("server_restart"));
    }

    #[tokio::test]
    async fn slow_consumer_is_kicked_with_reason() {
        let hub = RealtimeHub::default();
        let session_id = Uuid::new_v4();

        let sender_id = Uuid::new_v4();
        let (sender_tx, _sender_rx) = mpsc::channel(8);
        let (sender_close, _sender_close_rx) = mpsc::channel(1);
        hub.register(
            sender_id,
            Uuid::new_v4(),
            "GM".into(),
            usize::MAX,
            sender_tx,
            sender_close,
        )
        .await;
        assert!(hub.subscribe(sender_id, session_id, true).await);

        let slow_id = Uuid::new_v4();
        let (slow_tx, _slow_rx) = mpsc::channel(1);
        let (slow_close, mut slow_close_rx) = mpsc::channel(1);
        hub.register(
            slow_id,
            Uuid::new_v4(),
            "Player".into(),
            usize::MAX,
            slow_tx.clone(),
            slow_close,
        )
        .await;
        assert!(hub.subscribe(slow_id, session_id, false).await);

        slow_tx
            .try_send(ServerMessage::Heartbeat { server_time_ms: 0 })
            .unwrap();
        hub.publish(
            sender_id,
            session_id,
            "chat:x".into(),
            "refresh".into(),
            json!({}),
        )
        .await;

        assert_eq!(slow_close_rx.recv().await, Some("slow_consumer"));
        assert!(!hub.0.lock().await.clients.contains_key(&slow_id));
    }

    #[tokio::test]
    async fn membership_revalidation_revokes_subscription_and_presence() {
        let hub = RealtimeHub::default();
        let connection_id = Uuid::new_v4();
        let user_id = Uuid::new_v4();
        let revoked_session = Uuid::new_v4();
        let retained_session = Uuid::new_v4();
        let (tx, mut rx) = mpsc::channel(8);
        let (close, _close_rx) = mpsc::channel(1);

        hub.register(
            connection_id,
            user_id,
            "Player".into(),
            usize::MAX,
            tx,
            close,
        )
        .await;
        assert!(hub.subscribe(connection_id, revoked_session, false).await);
        assert!(hub.subscribe(connection_id, retained_session, true).await);
        hub.track_presence(
            connection_id,
            revoked_session,
            "revoked:presence".into(),
            json!({}),
        )
        .await;
        while rx.try_recv().is_ok() {}

        hub.reconcile_subscriptions(connection_id, &HashMap::from([(retained_session, false)]))
            .await;

        let state = hub.0.lock().await;
        let client = state.clients.get(&connection_id).unwrap();
        assert!(!client.sessions.contains_key(&revoked_session));
        assert_eq!(client.sessions.get(&retained_session), Some(&false));
        assert!(!client.presence.contains_key("revoked:presence"));
        drop(state);

        assert!(matches!(
            rx.try_recv(),
            Ok(ServerMessage::Unsubscribed {
                session_id,
                request_id: None,
            }) if session_id == revoked_session
        ));
    }

    #[test]
    fn burst_cursor_skips_notifies_for_rows_already_dispatched() {
        let mut cursor = BurstCursor::new(10);
        // notify for 11 arrives, scan returns the whole burst 11..=13
        assert!(cursor.needs_fetch(11));
        for id in 11..=13 {
            cursor.note_dispatched(id, 11);
        }
        assert_eq!(cursor.last_seen, 13);
        // the burst's remaining notifies are already handled, a new event isn't
        assert!(!cursor.needs_fetch(12));
        assert!(!cursor.needs_fetch(13));
        assert!(cursor.needs_fetch(14));
    }

    #[test]
    fn burst_cursor_fetches_a_row_committed_out_of_id_order() {
        let mut cursor = BurstCursor::new(10);
        // 12 and 13 commit first, then 11 (id assigned earlier) commits late
        assert!(cursor.needs_fetch(12));
        cursor.note_dispatched(12, 12);
        cursor.note_dispatched(13, 12);
        assert!(cursor.needs_fetch(11));
        cursor.note_dispatched(11, 11);
        assert_eq!(cursor.last_seen, 13);
    }

    #[test]
    fn burst_cursor_reset_drops_pending_ids() {
        let mut cursor = BurstCursor::new(0);
        assert!(cursor.needs_fetch(1));
        cursor.note_dispatched(1, 1);
        cursor.note_dispatched(2, 1);
        // reconnect: id 2's notify is gone, catch_up owns everything past 5
        cursor.reset(5);
        assert_eq!(cursor.last_seen, 5);
        assert!(cursor.needs_fetch(2));
        assert!(cursor.needs_fetch(6));
    }
}
