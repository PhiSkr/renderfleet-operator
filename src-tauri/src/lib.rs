use std::fs;
use std::path::Path;
use serde::{Serialize, Deserialize};

// --- HIER IST DIE MAGIE: Automatische Pfad-Erkennung ---
fn get_sync_root() -> String {
    if cfg!(target_os = "linux") {
        return "/srv/renderfleet/sync".to_string();
    } else {
        // Mac Pfad für User "phil"
        return "/Users/phil/RenderFleet/sync".to_string();
    }
}

#[derive(Serialize, Deserialize)]
struct VideoTask {
    path: String,
    name: String,
    prompt: String,
}

#[tauri::command]
fn dispatch_image_job(worker_id: String, job_id: String, prompt: String) -> Result<String, String> {
    let root = get_sync_root(); // <--- Holt den richtigen Pfad
    let base_path = format!("{}/image/assigned/{}/inbox", root, worker_id);
    let file_path = format!("{}/{}.txt", base_path, job_id);

    if !Path::new(&base_path).exists() {
        return Err(format!("Inbox for {} does not exist at {}!", worker_id, base_path));
    }
    fs::write(&file_path, prompt).map_err(|e| e.to_string())?;
    Ok(format!("Image Job {} dispatched!", job_id))
}

#[tauri::command]
fn dispatch_video_job(worker_id: String, job_id: String, tasks: Vec<VideoTask>) -> Result<String, String> {
    let root = get_sync_root(); // <--- Holt den richtigen Pfad
    let inbox_root = format!("{}/video/assigned/{}/inbox", root, worker_id);
    let job_dir = format!("{}/{}", inbox_root, job_id);

    if !Path::new(&inbox_root).exists() {
        return Err(format!("Video Inbox does not exist at {}!", inbox_root));
    }

    fs::create_dir_all(&job_dir).map_err(|e| e.to_string())?;

    let mut prompts_map = serde_json::Map::new();
    for task in tasks {
        let src_path = Path::new(&task.path);
        let dest_path = Path::new(&job_dir).join(&task.name);
        fs::copy(src_path, dest_path).map_err(|e| format!("Copy failed: {}", e))?;
        prompts_map.insert(task.name, serde_json::Value::String(task.prompt));
    }

    let json_str = serde_json::to_string_pretty(&prompts_map).map_err(|e| e.to_string())?;
    fs::write(format!("{}/prompts.json", job_dir), json_str).map_err(|e| e.to_string())?;
    fs::write(format!("{}/READY", job_dir), "").map_err(|e| e.to_string())?;

    Ok(format!("Video Job {} dispatched!", job_id))
}

#[tauri::command]
fn get_fleet_status() -> Result<Vec<String>, String> {
    let root = get_sync_root(); // <--- Holt den richtigen Pfad
    let hb_path = format!("{}/heartbeats", root);
    let mut workers = Vec::new();
    if let Ok(entries) = fs::read_dir(hb_path) {
        for entry in entries {
            if let Ok(entry) = entry {
                if let Ok(content) = fs::read_to_string(entry.path()) {
                    workers.push(content);
                }
            }
        }
    }
    Ok(workers)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            dispatch_image_job,
            dispatch_video_job,
            get_fleet_status
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
