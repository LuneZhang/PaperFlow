use base64::{engine::general_purpose::STANDARD, Engine};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

const STATE_DIR: &str = ".localscholar";
const STATE_FILE: &str = "state.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct OrganizeEntry {
    file_name: String,
    suggested_filename: String,
    category: String,
    journal: String,
    year: String,
    source_path: Option<String>,
    file_base64: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct OperationItem {
    hash: String,
    original_name: String,
    destination_path: String,
    category: String,
    journal: String,
    year: String,
    auto_renamed_from: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct OperationRecord {
    operation_id: String,
    timestamp: u64,
    items: Vec<OperationItem>,
    rolled_back: bool,
    rolled_back_at: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProcessedFileRecord {
    hash: String,
    original_name: String,
    destination_path: String,
    category: String,
    journal: String,
    year: String,
    operation_id: String,
    added_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LibraryState {
    version: u32,
    library_root: String,
    created_at: u64,
    updated_at: u64,
    processed_files: Vec<ProcessedFileRecord>,
    operations: Vec<OperationRecord>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct OrganizeDetail {
    original_name: String,
    destination_path: Option<String>,
    status: String,
    message: String,
    auto_renamed_from: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct OrganizeResult {
    operation_id: String,
    organized_count: usize,
    skipped_count: usize,
    renamed_count: usize,
    details: Vec<OrganizeDetail>,
    branches: Vec<String>,
    total_managed_files: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct RollbackResult {
    operation_id: Option<String>,
    restored_count: usize,
    details: Vec<String>,
    branches: Vec<String>,
    total_managed_files: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct RollbackPreviewItem {
    destination_path: String,
    rollback_path: String,
    exists: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct RollbackPreview {
    operation_id: Option<String>,
    total_items: usize,
    missing_items: usize,
    preview: Vec<RollbackPreviewItem>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct LibraryOverview {
    initialized: bool,
    library_root: String,
    managed_files: usize,
    branches: Vec<String>,
    operations_total: usize,
    pending_rollback_operations: usize,
}

fn now_epoch() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

fn make_operation_id() -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    format!("op_{nanos}")
}

fn state_dir_path(library_root: &Path) -> PathBuf {
    library_root.join(STATE_DIR)
}

fn state_file_path(library_root: &Path) -> PathBuf {
    state_dir_path(library_root).join(STATE_FILE)
}

fn load_or_init_state(library_root: &Path) -> Result<LibraryState, String> {
    let state_dir = state_dir_path(library_root);
    fs::create_dir_all(&state_dir)
        .map_err(|e| format!("Failed to initialize state directory: {e}"))?;

    let state_path = state_file_path(library_root);
    if !state_path.exists() {
        let ts = now_epoch();
        let state = LibraryState {
            version: 1,
            library_root: library_root.to_string_lossy().to_string(),
            created_at: ts,
            updated_at: ts,
            processed_files: Vec::new(),
            operations: Vec::new(),
        };
        save_state(library_root, &state)?;
        return Ok(state);
    }

    let content = fs::read_to_string(&state_path)
        .map_err(|e| format!("Failed to read state file: {e}"))?;
    serde_json::from_str(&content).map_err(|e| format!("Invalid state file content: {e}"))
}

fn save_state(library_root: &Path, state: &LibraryState) -> Result<(), String> {
    let content = serde_json::to_string_pretty(state)
        .map_err(|e| format!("Failed to serialize state: {e}"))?;
    fs::write(state_file_path(library_root), content)
        .map_err(|e| format!("Failed to persist state: {e}"))
}

fn sanitize_component(input: &str, fallback: &str) -> String {
    let mut out = String::with_capacity(input.len());
    for ch in input.chars() {
        if ch.is_alphanumeric() || ch == ' ' || ch == '-' || ch == '_' || ch == '.' {
            out.push(ch);
        } else if ch == '/' || ch == '\\' || ch == ':' || ch == '|' {
            out.push('_');
        }
    }

    let cleaned = out.trim();
    if cleaned.is_empty() {
        fallback.to_string()
    } else {
        cleaned.to_string()
    }
}

fn sanitize_filename(input: &str, fallback: &str) -> String {
    let mut out = String::with_capacity(input.len());
    for ch in input.chars() {
        if ch.is_alphanumeric() || ch == ' ' || ch == '-' || ch == '_' || ch == '.' || ch == '(' || ch == ')' {
            out.push(ch);
        } else if ch == '/' || ch == '\\' || ch == ':' || ch == '|' || ch == '*' || ch == '?' || ch == '"' || ch == '<' || ch == '>' {
            out.push('_');
        }
    }

    let cleaned = out.trim();
    if cleaned.is_empty() {
        fallback.to_string()
    } else {
        cleaned.to_string()
    }
}

fn ensure_pdf_extension(file_name: &str) -> String {
    if file_name.to_lowercase().ends_with(".pdf") {
        file_name.to_string()
    } else {
        format!("{file_name}.pdf")
    }
}

fn resolve_conflict(path: PathBuf) -> Result<(PathBuf, Option<String>), String> {
    if !path.exists() {
        return Ok((path, None));
    }

    let file_name = path
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| "Invalid destination file name.".to_string())?
        .to_string();
    let stem = path
        .file_stem()
        .and_then(|s| s.to_str())
        .ok_or_else(|| "Invalid destination file stem.".to_string())?;
    let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("");
    let parent = path
        .parent()
        .ok_or_else(|| "Invalid destination directory.".to_string())?;

    for idx in 1..10000 {
        let candidate_name = if ext.is_empty() {
            format!("{stem}_{idx}")
        } else {
            format!("{stem}_{idx}.{ext}")
        };
        let candidate = parent.join(candidate_name);
        if !candidate.exists() {
            return Ok((candidate, Some(file_name)));
        }
    }

    Err("Unable to resolve filename conflict after many attempts.".to_string())
}

fn move_file(src: &Path, dst: &Path) -> Result<(), String> {
    match fs::rename(src, dst) {
        Ok(()) => Ok(()),
        Err(_) => {
            fs::copy(src, dst).map_err(|e| format!("Fallback copy failed: {e}"))?;
            fs::remove_file(src).map_err(|e| format!("Fallback cleanup failed: {e}"))?;
            Ok(())
        }
    }
}

fn decode_file_content(entry: &OrganizeEntry) -> Result<Vec<u8>, String> {
    if let Some(source_path) = &entry.source_path {
        if !source_path.trim().is_empty() {
            return fs::read(source_path).map_err(|e| format!("Failed to read source file: {e}"));
        }
    }

    if let Some(content) = &entry.file_base64 {
        let normalized = if let Some((_, right)) = content.split_once(',') {
            right
        } else {
            content
        };
        return STANDARD
            .decode(normalized)
            .map_err(|e| format!("Invalid base64 payload: {e}"));
    }

    Err("Entry must include sourcePath or fileBase64.".to_string())
}

fn hash_bytes(bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    let digest = hasher.finalize();
    format!("{digest:x}")
}

fn build_branches(state: &LibraryState) -> Vec<String> {
    let mut set = HashSet::new();
    for f in &state.processed_files {
        set.insert(format!("{}/{}/{}", f.category, f.journal, f.year));
    }
    let mut branches: Vec<String> = set.into_iter().collect();
    branches.sort();
    branches
}

fn find_pending_operation_index(state: &LibraryState, operation_id: &str) -> Option<usize> {
    state
        .operations
        .iter()
        .position(|op| op.operation_id == operation_id && !op.rolled_back)
}

#[tauri::command]
fn get_library_overview(library_root: String) -> Result<LibraryOverview, String> {
    let root = PathBuf::from(library_root.trim());
    if root.as_os_str().is_empty() {
        return Err("libraryRoot cannot be empty.".to_string());
    }

    let state_path = state_file_path(&root);
    if !state_path.exists() {
        return Ok(LibraryOverview {
            initialized: false,
            library_root: root.to_string_lossy().to_string(),
            managed_files: 0,
            branches: Vec::new(),
            operations_total: 0,
            pending_rollback_operations: 0,
        });
    }

    let state = load_or_init_state(&root)?;
    let pending = state.operations.iter().filter(|op| !op.rolled_back).count();

    Ok(LibraryOverview {
        initialized: true,
        library_root: root.to_string_lossy().to_string(),
        managed_files: state.processed_files.len(),
        branches: build_branches(&state),
        operations_total: state.operations.len(),
        pending_rollback_operations: pending,
    })
}

#[tauri::command]
fn apply_organization(
    library_root: String,
    entries: Vec<OrganizeEntry>,
    operation_id: Option<String>,
) -> Result<OrganizeResult, String> {
    let root = PathBuf::from(library_root.trim());
    if root.as_os_str().is_empty() {
        return Err("libraryRoot cannot be empty.".to_string());
    }
    if entries.is_empty() {
        return Err("No files to organize.".to_string());
    }

    fs::create_dir_all(&root).map_err(|e| format!("Failed to create library root: {e}"))?;

    let mut state = load_or_init_state(&root)?;
    let operation_id = if let Some(existing_id) = operation_id {
        if find_pending_operation_index(&state, &existing_id).is_some() {
            existing_id
        } else {
            make_operation_id()
        }
    } else {
        make_operation_id()
    };

    let staging_dir = state_dir_path(&root).join("staging").join(&operation_id);
    fs::create_dir_all(&staging_dir).map_err(|e| format!("Failed to prepare staging dir: {e}"))?;

    let mut operation_items_delta = Vec::new();
    let mut details = Vec::new();
    let mut skipped_count = 0;
    let mut renamed_count = 0;

    for (idx, entry) in entries.into_iter().enumerate() {
        let bytes = match decode_file_content(&entry) {
            Ok(bytes) => bytes,
            Err(err) => {
                skipped_count += 1;
                details.push(OrganizeDetail {
                    original_name: entry.file_name,
                    destination_path: None,
                    status: "skipped".to_string(),
                    message: err,
                    auto_renamed_from: None,
                });
                continue;
            }
        };

        let hash = hash_bytes(&bytes);
        if state.processed_files.iter().any(|f| f.hash == hash) {
            skipped_count += 1;
            details.push(OrganizeDetail {
                original_name: entry.file_name,
                destination_path: None,
                status: "skipped".to_string(),
                message: "File already managed in library (same content hash).".to_string(),
                auto_renamed_from: None,
            });
            continue;
        }

        let source_name = sanitize_filename(&entry.file_name, &format!("file_{idx}.pdf"));
        let staging_file = staging_dir.join(format!("{}_{}", idx, ensure_pdf_extension(&source_name)));
        fs::write(&staging_file, &bytes).map_err(|e| format!("Failed writing staging file: {e}"))?;

        let category = sanitize_component(&entry.category, "Uncategorized");
        let journal = sanitize_component(&entry.journal, "Unknown");
        let year = sanitize_component(&entry.year, "Unknown");

        let target_dir = root.join(&category).join(&journal).join(&year);
        fs::create_dir_all(&target_dir).map_err(|e| format!("Failed to create target tree: {e}"))?;

        let suggested = if entry.suggested_filename.trim().is_empty() {
            ensure_pdf_extension(&source_name)
        } else {
            ensure_pdf_extension(&entry.suggested_filename)
        };
        let desired = sanitize_filename(&suggested, &ensure_pdf_extension(&source_name));
        let (final_path, renamed_from) = resolve_conflict(target_dir.join(desired))?;

        if renamed_from.is_some() {
            renamed_count += 1;
        }

        move_file(&staging_file, &final_path)?;

        let destination_path = final_path.to_string_lossy().to_string();
        let added_at = now_epoch();

        state.processed_files.push(ProcessedFileRecord {
            hash: hash.clone(),
            original_name: source_name.clone(),
            destination_path: destination_path.clone(),
            category: category.clone(),
            journal: journal.clone(),
            year: year.clone(),
            operation_id: operation_id.clone(),
            added_at,
        });

        operation_items_delta.push(OperationItem {
            hash,
            original_name: source_name.clone(),
            destination_path: destination_path.clone(),
            category,
            journal,
            year,
            auto_renamed_from: renamed_from.clone(),
        });

        details.push(OrganizeDetail {
            original_name: source_name,
            destination_path: Some(destination_path),
            status: "organized".to_string(),
            message: "Moved from staging into library tree.".to_string(),
            auto_renamed_from: renamed_from,
        });
    }

    let organized_count = operation_items_delta.len();
    if organized_count > 0 {
        if let Some(existing_idx) = find_pending_operation_index(&state, &operation_id) {
            state.operations[existing_idx]
                .items
                .extend(operation_items_delta);
            state.operations[existing_idx].timestamp = now_epoch();
        } else {
            state.operations.push(OperationRecord {
                operation_id: operation_id.clone(),
                timestamp: now_epoch(),
                items: operation_items_delta,
                rolled_back: false,
                rolled_back_at: None,
            });
        }
    }

    state.updated_at = now_epoch();
    save_state(&root, &state)?;

    Ok(OrganizeResult {
        operation_id,
        organized_count,
        skipped_count,
        renamed_count,
        details,
        branches: build_branches(&state),
        total_managed_files: state.processed_files.len(),
    })
}

#[tauri::command]
fn preview_last_rollback(library_root: String) -> Result<RollbackPreview, String> {
    let root = PathBuf::from(library_root.trim());
    if root.as_os_str().is_empty() {
        return Err("libraryRoot cannot be empty.".to_string());
    }

    let state = load_or_init_state(&root)?;
    let position = state.operations.iter().rposition(|op| !op.rolled_back);
    let Some(op_index) = position else {
        return Ok(RollbackPreview {
            operation_id: None,
            total_items: 0,
            missing_items: 0,
            preview: Vec::new(),
        });
    };

    let operation = &state.operations[op_index];
    let rollback_root = state_dir_path(&root).join("rollback").join(&operation.operation_id);
    let mut preview = Vec::with_capacity(operation.items.len());
    let mut missing_items = 0;

    for item in operation.items.iter().rev() {
        let destination = PathBuf::from(&item.destination_path);
        if !destination.exists() {
            missing_items += 1;
        }

        let fallback_name = format!("{}_{}.pdf", item.original_name, item.hash);
        let file_name = destination
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or(&fallback_name);
        let rollback_path = rollback_root.join(file_name).to_string_lossy().to_string();

        preview.push(RollbackPreviewItem {
            destination_path: item.destination_path.clone(),
            rollback_path,
            exists: destination.exists(),
        });
    }

    Ok(RollbackPreview {
        operation_id: Some(operation.operation_id.clone()),
        total_items: operation.items.len(),
        missing_items,
        preview,
    })
}

#[tauri::command]
fn rollback_last_organization(library_root: String) -> Result<RollbackResult, String> {
    let root = PathBuf::from(library_root.trim());
    if root.as_os_str().is_empty() {
        return Err("libraryRoot cannot be empty.".to_string());
    }

    let mut state = load_or_init_state(&root)?;

    let position = state.operations.iter().rposition(|op| !op.rolled_back);
    let Some(op_index) = position else {
        return Ok(RollbackResult {
            operation_id: None,
            restored_count: 0,
            details: vec!["No unapplied operation to rollback.".to_string()],
            branches: build_branches(&state),
            total_managed_files: state.processed_files.len(),
        });
    };

    let operation_id = state.operations[op_index].operation_id.clone();
    let rollback_root = state_dir_path(&root).join("rollback").join(&operation_id);
    fs::create_dir_all(&rollback_root)
        .map_err(|e| format!("Failed to create rollback directory: {e}"))?;

    let mut restored_count = 0;
    let mut details = Vec::new();

    for item in state.operations[op_index].items.iter().rev() {
        let destination = PathBuf::from(&item.destination_path);
        if !destination.exists() {
            details.push(format!(
                "Missing file during rollback (already absent): {}",
                item.destination_path
            ));
            continue;
        }

        let fallback_name = format!("{}_{}.pdf", item.original_name, item.hash);
        let file_name = destination
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or(&fallback_name);

        let (rollback_target, _) = resolve_conflict(rollback_root.join(file_name))?;
        move_file(&destination, &rollback_target)?;
        restored_count += 1;
        details.push(format!(
            "Reverted: {} -> {}",
            item.destination_path,
            rollback_target.to_string_lossy()
        ));
    }

    state.processed_files.retain(|f| f.operation_id != operation_id);
    state.operations[op_index].rolled_back = true;
    state.operations[op_index].rolled_back_at = Some(now_epoch());
    state.updated_at = now_epoch();
    save_state(&root, &state)?;

    Ok(RollbackResult {
        operation_id: Some(operation_id),
        restored_count,
        details,
        branches: build_branches(&state),
        total_managed_files: state.processed_files.len(),
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            get_library_overview,
            apply_organization,
            preview_last_rollback,
            rollback_last_organization,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
