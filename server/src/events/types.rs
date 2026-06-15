use serde_json::Value;
use uuid::Uuid;

pub struct NewEvent {
    pub aggregate_type: &'static str,
    pub aggregate_id: Uuid,
    pub session_id: Option<Uuid>,
    pub event_type: &'static str,
    pub payload: Value,
    pub metadata: Value,
}
