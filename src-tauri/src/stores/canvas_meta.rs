use sqlx::SqlitePool;

use crate::db::models::CanvasMeta;
use crate::error::AppResult;

pub async fn list(pool: &SqlitePool) -> AppResult<Vec<CanvasMeta>> {
    let rows: Vec<(String, String, String)> =
        sqlx::query_as("SELECT id, name, created_at FROM canvas_meta ORDER BY created_at ASC")
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
    let now = chrono::Utc::now()
        .format("%Y-%m-%dT%H:%M:%S%.3fZ")
        .to_string();
    sqlx::query(
        "INSERT INTO canvas_meta (id, name, created_at) VALUES (?, ?, ?)
         ON CONFLICT(id) DO NOTHING",
    )
    .bind(id)
    .bind(name)
    .bind(&now)
    .execute(pool)
    .await?;

    let (name, created_at): (String, String) =
        sqlx::query_as("SELECT name, created_at FROM canvas_meta WHERE id = ?")
            .bind(id)
            .fetch_one(pool)
            .await?;

    Ok(CanvasMeta {
        id: id.to_string(),
        name,
        created_at,
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
    let mut transaction = pool.begin().await?;
    sqlx::query("DELETE FROM chat_threads WHERE canvas_id = ?")
        .bind(id)
        .execute(&mut *transaction)
        .await?;
    sqlx::query("DELETE FROM canvas_states WHERE game_id = ?")
        .bind(id)
        .execute(&mut *transaction)
        .await?;
    sqlx::query("DELETE FROM canvas_meta WHERE id = ?")
        .bind(id)
        .execute(&mut *transaction)
        .await?;
    transaction.commit().await?;
    Ok(())
}
