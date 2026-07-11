use sqlx::SqlitePool;

use crate::db::models::{WorkflowFolder, WorkflowOrderItem, WorkflowOrganization};
use crate::error::AppResult;

pub async fn get_for_user(pool: &SqlitePool, user_id: &str) -> AppResult<WorkflowOrganization> {
    let folder_rows: Vec<(String, String, i64)> = sqlx::query_as(
        "SELECT id, name, sort_order FROM workflow_folders WHERE user_id = ? ORDER BY sort_order ASC, created_at ASC",
    )
    .bind(user_id)
    .fetch_all(pool)
    .await?;

    let item_rows: Vec<(String, Option<String>, i64)> = sqlx::query_as(
        "SELECT workflow_id, folder_id, sort_order FROM workflow_sidebar_order WHERE user_id = ? ORDER BY sort_order ASC",
    )
    .bind(user_id)
    .fetch_all(pool)
    .await?;

    Ok(WorkflowOrganization {
        folders: folder_rows
            .into_iter()
            .map(|(id, name, sort_order)| WorkflowFolder {
                id,
                name,
                sort_order,
            })
            .collect(),
        items: item_rows
            .into_iter()
            .map(|(workflow_id, folder_id, sort_order)| WorkflowOrderItem {
                workflow_id,
                folder_id,
                sort_order,
            })
            .collect(),
    })
}

pub async fn reorder_items(
    pool: &SqlitePool,
    user_id: &str,
    items: &[WorkflowOrderItem],
) -> AppResult<()> {
    let mut tx = pool.begin().await?;

    sqlx::query("DELETE FROM workflow_sidebar_order WHERE user_id = ?")
        .bind(user_id)
        .execute(&mut *tx)
        .await?;

    for item in items {
        sqlx::query(
            "INSERT INTO workflow_sidebar_order (user_id, workflow_id, folder_id, sort_order) VALUES (?, ?, ?, ?)",
        )
        .bind(user_id)
        .bind(&item.workflow_id)
        .bind(&item.folder_id)
        .bind(item.sort_order)
        .execute(&mut *tx)
        .await?;
    }

    tx.commit().await?;
    Ok(())
}

pub async fn create_folder(
    pool: &SqlitePool,
    user_id: &str,
    id: &str,
    name: &str,
) -> AppResult<WorkflowFolder> {
    let max_row: (Option<i64>,) =
        sqlx::query_as("SELECT MAX(sort_order) FROM workflow_folders WHERE user_id = ?")
            .bind(user_id)
            .fetch_one(pool)
            .await?;
    let sort_order = max_row.0.unwrap_or(-1) + 1;

    sqlx::query("INSERT INTO workflow_folders (id, user_id, name, sort_order) VALUES (?, ?, ?, ?)")
        .bind(id)
        .bind(user_id)
        .bind(name)
        .bind(sort_order)
        .execute(pool)
        .await?;

    Ok(WorkflowFolder {
        id: id.to_string(),
        name: name.to_string(),
        sort_order,
    })
}

pub async fn rename_folder(
    pool: &SqlitePool,
    user_id: &str,
    folder_id: &str,
    name: &str,
) -> AppResult<()> {
    sqlx::query("UPDATE workflow_folders SET name = ? WHERE id = ? AND user_id = ?")
        .bind(name)
        .bind(folder_id)
        .bind(user_id)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn delete_folder(pool: &SqlitePool, user_id: &str, folder_id: &str) -> AppResult<()> {
    sqlx::query("DELETE FROM workflow_folders WHERE id = ? AND user_id = ?")
        .bind(folder_id)
        .bind(user_id)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn reorder_folders(
    pool: &SqlitePool,
    user_id: &str,
    folders: &[(String, i64)], // (id, sort_order)
) -> AppResult<()> {
    let mut tx = pool.begin().await?;
    for (id, sort_order) in folders {
        sqlx::query("UPDATE workflow_folders SET sort_order = ? WHERE id = ? AND user_id = ?")
            .bind(sort_order)
            .bind(id)
            .bind(user_id)
            .execute(&mut *tx)
            .await?;
    }
    tx.commit().await?;
    Ok(())
}
