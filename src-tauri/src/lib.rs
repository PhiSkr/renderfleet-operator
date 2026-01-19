use std::fs;
use std::path::Path;
use serde::{Serialize, Deserialize};

// Struktur für Video-Prompts
#[derive(Serialize, Deserialize)]
struct VideoTask {
    path: String, // Pfad zum Quellbild
    name: String, // Dateiname
    prompt: String,
}

// --- COMMAND: Image Job senden ---
#[tauri::command]
fn dispatch_image_job(worker_id: String, job_id: String, prompt: String) -> Result<String, String> {
    let base_path = format!("/srv/renderfleet/sync/image/assigned/{}/inbox", worker_id);
    let file_path = format!("{}/{}.txt", base_path, job_id);

    if !Path::new(&base_path).exists() {
        return Err(format!("Inbox for {} does not exist!", worker_id));
    }
    fs::write(&file_path, prompt).map_err(|e| e.to_string())?;
    Ok(format!("Image Job {} dispatched!", job_id))
}

// --- COMMAND: Video Job senden (Der komplexe Teil) ---
#[tauri::command]
fn dispatch_video_job(worker_id: String, job_id: String, tasks: Vec<VideoTask>) -> Result<String, String> {
    // 1. Ziel-Ordner definieren
    // ACHTUNG: Video Jobs landen in einem Unterordner!
    let inbox_root = format!("/srv/renderfleet/sync/video/assigned/{}/inbox", worker_id);
    let job_dir = format!("{}/{}", inbox_root, job_id);

    if !Path::new(&inbox_root).exists() {
        return Err(format!("Video Inbox for {} does not exist!", worker_id));
    }

    // 2. Job Ordner erstellen
    fs::create_dir_all(&job_dir).map_err(|e| e.to_string())?;

    // 3. Bilder kopieren & JSON Map bauen
    let mut prompts_map = serde_json::Map::new();

    for task in tasks {
        let src_path = Path::new(&task.path);
        let dest_path = Path::new(&job_dir).join(&task.name);
        
        // Datei kopieren
        fs::copy(src_path, dest_path).map_err(|e| format!("Copy failed for {}: {}", task.name, e))?;
        
        // Eintrag in JSON Map
        prompts_map.insert(task.name, serde_json::Value::String(task.prompt));
    }

    // 4. prompts.json schreiben
    let json_str = serde_json::to_string_pretty(&prompts_map).map_err(|e| e.to_string())?;
    fs::write(format!("{}/prompts.json", job_dir), json_str).map_err(|e| e.to_string())?;

    // 5. Trigger setzen (READY file)
    fs::write(format!("{}/READY", job_dir), "").map_err(|e| e.to_string())?;

    Ok(format!("Video Job {} dispatched with {} clips!", job_id, prompts_map.len()))
}

// --- COMMAND: Heartbeats lesen ---
#[tauri::command]
fn get_fleet_status() -> Result<Vec<String>, String> {
    let hb_path = "/srv/renderfleet/sync/heartbeats";
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
