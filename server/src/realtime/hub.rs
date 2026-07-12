use std::collections::{HashMap, HashSet};
use std::sync::Arc;

use serde_json::{Value, json};
use tokio::sync::{Mutex, mpsc};
use uuid::Uuid;

use super::protocol::{EventRow, ServerMessage};
use crate::auth::jwt;
use crate::domains::hex::visibility as hex_visibility;

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

impl RealtimeHub {
    pub(super) async fn register(
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

    pub(super) async fn remove(&self, id: Uuid) {
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

    pub(super) async fn sender(&self, id: Uuid) -> Option<mpsc::Sender<ServerMessage>> {
        self.0.lock().await.clients.get(&id).map(|c| c.tx.clone())
    }

    pub(super) async fn identity(&self, id: Uuid) -> Option<(Uuid, mpsc::Sender<ServerMessage>)> {
        self.0
            .lock()
            .await
            .clients
            .get(&id)
            .map(|c| (c.user_id, c.tx.clone()))
    }

    pub(super) async fn subscription_identity(&self, id: Uuid) -> Option<(Uuid, Vec<Uuid>)> {
        self.0.lock().await.clients.get(&id).map(|client| {
            (
                client.user_id,
                client.sessions.keys().copied().collect::<Vec<_>>(),
            )
        })
    }

    pub(super) async fn refresh_identity(
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
    pub(super) async fn expired(&self, id: Uuid) -> bool {
        let now = chrono::Utc::now().timestamp().max(0) as usize;
        self.0.lock().await.clients.get(&id).is_none_or(|client| {
            client
                .expires_at
                .saturating_add(jwt::EXP_LEEWAY_SECONDS as usize)
                <= now
        })
    }

    pub(super) async fn subscribe(&self, id: Uuid, session_id: Uuid, is_gm: bool) -> bool {
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

    pub(super) async fn unsubscribe(&self, id: Uuid, session_id: Uuid) {
        if let Some(client) = self.0.lock().await.clients.get_mut(&id) {
            client.sessions.remove(&session_id);
        }
    }

    pub(super) async fn reconcile_subscriptions(&self, id: Uuid, authorized: &HashMap<Uuid, bool>) {
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

    pub(super) async fn publish(
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
            if client.sessions.contains_key(&session_id)
                && client
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

    pub(super) async fn track_presence(
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

    pub(super) async fn untrack_presence(&self, id: Uuid, session_id: Uuid, channel: &str) {
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

    pub(super) async fn broadcast_presence(&self, channel: &str) {
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
                if client.presence.contains_key(channel)
                    && client
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

    pub(super) async fn dispatch_event(&self, row: EventRow) {
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
}
