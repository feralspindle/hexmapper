use std::collections::{HashMap, HashSet};
use std::sync::Arc;
use std::time::{Duration, Instant};

use axum::extract::ws::{Message, WebSocket};
use axum::extract::{State, WebSocketUpgrade};
use axum::http::{header::ORIGIN, HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::get;
use axum::Router;
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::postgres::PgListener;
use tokio::sync::{mpsc, Mutex};
use uuid::Uuid;

use crate::auth::jwt;
use crate::authz;
use crate::state::AppState;

const AUTH_TIMEOUT: Duration = Duration::from_secs(5);
const CLIENT_STALE_TIMEOUT: Duration = Duration::from_secs(75);
const SEND_TIMEOUT: Duration = Duration::from_secs(5);
const OUTBOUND_CAPACITY: usize = 256;
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
    close: mpsc::Sender<()>,
    sessions: HashMap<Uuid, bool>,
    presence: HashMap<String, Value>,
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
    let origin_matches = headers
        .get(ORIGIN)
        .and_then(|value| value.to_str().ok())
        .is_some_and(|origin| origin == state.cors_allowed_origin());
    if !origin_matches {
        metrics::counter!("realtime_upgrade_rejections_total", "reason" => "origin").increment(1);
        return StatusCode::FORBIDDEN.into_response();
    }
    ws.max_message_size(MAX_FRAME_BYTES)
        .on_upgrade(move |socket| handle_socket(socket, state))
}

async fn handle_socket(socket: WebSocket, state: AppState) {
    let (mut sink, mut stream) = socket.split();
    let auth = tokio::time::timeout(AUTH_TIMEOUT, stream.next()).await;
    let Some(Ok(Message::Text(text))) = auth.ok().flatten() else {
        metrics::counter!("realtime_auth_failures_total", "reason" => "missing_frame").increment(1);
        return;
    };
    let Ok(ClientMessage::Authenticate {
        token,
        client_id: _client_id,
    }) = serde_json::from_str(&text)
    else {
        metrics::counter!("realtime_auth_failures_total", "reason" => "invalid_frame").increment(1);
        return;
    };
    let Ok(claims) = jwt::verify(&token, state.jwks()) else {
        metrics::counter!("realtime_auth_failures_total", "reason" => "invalid_token").increment(1);
        return;
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

    let ready = ServerMessage::Ready {
        connection_id,
        heartbeat_seconds: 25,
    };
    if send_json(&mut sink, &ready).await.is_err() {
        state.realtime().remove(connection_id).await;
        metrics::gauge!("realtime_connections").decrement(1.0);
        return;
    }

    let mut heartbeat = tokio::time::interval(Duration::from_secs(25));
    let mut last_pong = Instant::now();
    loop {
        tokio::select! {
            outbound = rx.recv() => {
                let Some(outbound) = outbound else { break };
                if send_json_bounded(&mut sink, &outbound).await.is_err() { break; }
            }
            _ = close_rx.recv() => break,
            inbound = stream.next() => {
                match inbound {
                    Some(Ok(Message::Text(text))) => {
                        if text.len() > MAX_FRAME_BYTES { break; }
                        if let Ok(message) = serde_json::from_str::<ClientMessage>(&text) {
                            handle_client_message(connection_id, message, &state).await;
                        } else {
                            send_error(&tx, None, "invalid_message", "Invalid realtime message").await;
                        }
                    }
                    Some(Ok(Message::Pong(_))) => last_pong = Instant::now(),
                    Some(Ok(Message::Close(_))) | None | Some(Err(_)) => break,
                    _ => {}
                }
            }
            _ = heartbeat.tick() => {
                if state.realtime().expired(connection_id).await { break; }
                if last_pong.elapsed() > CLIENT_STALE_TIMEOUT {
                    metrics::counter!("realtime_disconnects_total", "reason" => "pong_timeout").increment(1);
                    break;
                }
                let heartbeat = ServerMessage::Heartbeat { server_time_ms: chrono::Utc::now().timestamp_millis() };
                if send_json_bounded(&mut sink, &heartbeat).await.is_err() { break; }
                if !matches!(
                    tokio::time::timeout(
                        SEND_TIMEOUT,
                        sink.send(Message::Ping(Vec::new().into())),
                    )
                    .await,
                    Ok(Ok(()))
                ) {
                    metrics::counter!("realtime_disconnects_total", "reason" => "heartbeat_send").increment(1);
                    break;
                }
            }
        }
    }

    state.realtime().remove(connection_id).await;
    metrics::gauge!("realtime_connections").decrement(1.0);
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
            if let Ok(claims) = jwt::verify(&token, state.jwks()) {
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
        close: mpsc::Sender<()>,
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

    async fn expired(&self, id: Uuid) -> bool {
        let now = chrono::Utc::now().timestamp().max(0) as usize;
        self.0
            .lock()
            .await
            .clients
            .get(&id)
            .map_or(true, |client| client.expires_at <= now)
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
                let _ = client.close.try_send(());
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
            client.presence.insert(channel.clone(), payload);
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
            let mut by_user = HashMap::<Uuid, Value>::new();
            for client in hub.clients.values() {
                if let Some(value) = client.presence.get(channel) {
                    by_user.insert(client.user_id, value.clone());
                }
            }
            let presences = by_user.into_values().collect::<Vec<_>>();
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
                    let _ = client.close.try_send(());
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
                let _ = client.close.try_send(());
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

    async fn disconnect_all(&self) {
        let clients = std::mem::take(&mut self.0.lock().await.clients);
        for client in clients.into_values() {
            let _ = client.close.try_send(());
        }
    }
}

fn visible_event(row: &EventRow, is_gm: bool) -> Option<(String, Value)> {
    if row.aggregate_type != "hex_cell" || is_gm {
        return Some((
            row.event_type.clone(),
            with_identity(&row.payload, row.aggregate_id, row.session_id),
        ));
    }

    let mut payload = with_identity(&row.payload, row.aggregate_id, row.session_id);
    let revealed = payload.get("revealed").and_then(Value::as_bool) == Some(true);
    if row.event_type == "hex_cell.deleted" || !revealed {
        let mut removal = serde_json::Map::new();
        for key in ["id", "session_id", "map_id", "q", "r"] {
            if let Some(value) = payload.get(key) {
                removal.insert(key.to_string(), value.clone());
            }
        }
        return Some(("hex_cell.deleted".into(), Value::Object(removal)));
    }
    if let Value::Object(object) = &mut payload {
        object.remove("gm_markers");
        object.remove("source_client");
    }
    Some((row.event_type.clone(), payload))
}

fn with_identity(payload: &Value, aggregate_id: Uuid, session_id: Option<Uuid>) -> Value {
    let mut payload = payload.clone();
    if !payload.is_object() {
        payload = json!({});
    }
    if let Value::Object(object) = &mut payload {
        object.entry("id").or_insert_with(|| json!(aggregate_id));
        if let Some(session_id) = session_id {
            object
                .entry("session_id")
                .or_insert_with(|| json!(session_id));
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

async fn listen(database_url: &str, state: &AppState) -> Result<(), sqlx::Error> {
    let mut listener = PgListener::connect(database_url).await?;
    listener.listen("hexmap_events").await?;
    loop {
        let notification = listener.recv().await?;
        let Ok(id) = notification.payload().parse::<i64>() else {
            continue;
        };
        let row = sqlx::query_as::<_, EventRow>(
            "select id, aggregate_type, aggregate_id, session_id, event_type, payload, metadata, created_at from events where id = $1"
        )
        .bind(id)
        .fetch_optional(state.pool())
        .await?;
        if let Some(row) = row {
            let lag = (chrono::Utc::now() - row.created_at)
                .num_milliseconds()
                .max(0) as f64
                / 1000.0;
            metrics::histogram!("realtime_event_delivery_lag_seconds").record(lag);
            state.realtime().dispatch_event(row).await;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

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
    fn hidden_hex_becomes_removal() {
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
        assert_eq!(event, "hex_cell.deleted");
        assert!(payload.get("gm_markers").is_none());
    }
}
