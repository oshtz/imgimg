use sqlx::SqlitePool;

use crate::db::models::CanvasMeta;
use crate::error::AppResult;

pub async fn list(pool: &SqlitePool) -> AppResult<Vec<CanvasMeta>> {
    let rows: Vec<(String, String, String)> = sqlx::query_as(
        "SELECT id, name, created_at FROM canvas_meta ORDER BY created_at ASC",
    )
    .fetch_all(pool)
    .await?;

    Ok(rows
        .into_iter()
        .map(|(id, name, created_at)| CanvasMeta {
            id,
            name,
            created_at,
        })
        .collect())
}

pub async fn create(pool: &SqlitePool, id: &str, name: &str) -> AppResult<CanvasMeta> {
    let now = chrono::Utc::now().format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string();
    sqlx::query(
        "INSERT INTO canvas_meta (id, name, created_at) VALUES (?, ?, ?)",
    )
    .bind(id)
    .bind(name)
    .bind(&now)
    .execute(pool)
    .await?;

    Ok(CanvasMeta {
        id: id.to_string(),
        name: name.to_string(),
        created_at: now,
    })
}

pub async fn rename(pool: &SqlitePool, id: &str, name: &str) -> AppResult<()> {
    sqlx::query("UPDATE canvas_meta SET name = ? WHERE id = ?")
        .bind(name)
        .bind(id)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn delete(pool: &SqlitePool, id: &str) -> AppResult<()> {
    sqlx::query("DELETE FROM canvas_meta WHERE id = ?")
        .bind(id)
        .execute(pool)
        .await?;
    // Also delete the associated canvas state
    sqlx::query("DELETE FROM canvas_states WHERE game_id = ?")
        .bind(id)
        .execute(pool)
        .await?;
    Ok(())
}
