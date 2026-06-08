use sqlx::SqlitePool;

use crate::error::AppResult;

pub async fn get_pinned_for_user(pool: &SqlitePool, user_id: &str) -> AppResult<Vec<String>> {
    let rows: Vec<(String,)> = sqlx::query_as(
        "SELECT workflow_id FROM user_pinned_workflows WHERE user_id = ? ORDER BY pinned_at ASC",
    )
    .bind(user_id)
    .fetch_all(pool)
    .await?;
    Ok(rows.into_iter().map(|(id,)| id).collect())
}

pub async fn pin(pool: &SqlitePool, user_id: &str, workflow_id: &str) -> AppResult<()> {
    sqlx::query(
        "INSERT INTO user_pinned_workflows (user_id, workflow_id) VALUES (?, ?) ON CONFLICT DO NOTHING",
    )
    .bind(user_id)
    .bind(workflow_id)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn unpin(pool: &SqlitePool, user_id: &str, workflow_id: &str) -> AppResult<()> {
    sqlx::query("DELETE FROM user_pinned_workflows WHERE user_id = ? AND workflow_id = ?")
        .bind(user_id)
        .bind(workflow_id)
        .execute(pool)
        .await?;
    Ok(())
}
