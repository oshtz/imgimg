use uuid::Uuid;

pub fn new_id(prefix: &str) -> String {
    format!("{}_{}", prefix, Uuid::new_v4())
}
