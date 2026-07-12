use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

#[derive(Debug, Serialize, Clone)]
#[serde(tag = "type", rename_all = "snake_case")]
pub(super) enum ServerMessage {
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
pub(super) enum ClientMessage {
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
pub(super) struct EventRow {
    pub(super) id: i64,
    pub(super) aggregate_type: String,
    pub(super) aggregate_id: Uuid,
    pub(super) session_id: Option<Uuid>,
    pub(super) event_type: String,
    pub(super) payload: Value,
    pub(super) metadata: Value,
    pub(super) created_at: chrono::DateTime<chrono::Utc>,
}
