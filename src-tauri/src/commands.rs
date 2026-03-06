use serde::{Deserialize, Serialize};
use sha1::{Digest, Sha1};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use tauri::{AppHandle, Emitter};

// ── File Operations ──────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FileNode {
    pub name: String,
    pub path: String,
    #[serde(rename = "type")]
    pub node_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub children: Option<Vec<FileNode>>,
}

const IGNORED_PATTERNS: &[&str] = &[
    "node_modules",
    ".git",
    ".next",
    "dist",
    "build",
    ".env",
    ".env.local",
    ".DS_Store",
    "coverage",
];

const TOOL_IGNORE_PATTERNS: &[&str] = &[
    "node_modules",
    ".git",
    ".next",
    "dist",
    "build",
    ".cache",
    ".log",
    ".DS_Store",
    "Thumbs.db",
    "coverage",
    ".nyc_output",
    ".env",
    ".env.local",
    "bun.lock",
    "package-lock.json",
    "yarn.lock",
    "pnpm-lock.yaml",
];

fn should_ignore(name: &str, patterns: &[&str]) -> bool {
    patterns.iter().any(|p| {
        if p.starts_with("*.") {
            let ext = &p[1..];
            name.ends_with(ext)
        } else {
            name.contains(p)
        }
    })
}

fn scan_directory(dir_path: &Path) -> Result<Vec<FileNode>, String> {
    let entries =
        fs::read_dir(dir_path).map_err(|e| format!("Failed to read directory: {}", e))?;

    let mut nodes: Vec<FileNode> = Vec::new();

    for entry in entries {
        let entry = match entry {
            Ok(e) => e,
            Err(_) => continue,
        };
        let name = entry.file_name().to_string_lossy().to_string();
        if should_ignore(&name, IGNORED_PATTERNS) {
            continue;
        }

        let full_path = entry.path().to_string_lossy().to_string();
        let is_dir = entry.file_type().map(|t| t.is_dir()).unwrap_or(false);

        nodes.push(FileNode {
            name,
            path: full_path,
            node_type: if is_dir {
                "directory".to_string()
            } else {
                "file".to_string()
            },
            children: if is_dir { Some(Vec::new()) } else { None },
        });
    }

    nodes.sort_by(|a, b| {
        if a.node_type == b.node_type {
            a.name.to_lowercase().cmp(&b.name.to_lowercase())
        } else if a.node_type == "directory" {
            std::cmp::Ordering::Less
        } else {
            std::cmp::Ordering::Greater
        }
    });

    Ok(nodes)
}

#[tauri::command]
pub async fn list_files(path: String) -> Result<FileNode, String> {
    let p = Path::new(&path);

    if p.is_file() {
        return Ok(FileNode {
            name: p
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_default(),
            path: path.clone(),
            node_type: "file".to_string(),
            children: None,
        });
    }

    let children = scan_directory(p)?;
    Ok(FileNode {
        name: p
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default(),
        path: path.clone(),
        node_type: "directory".to_string(),
        children: Some(children),
    })
}

#[tauri::command]
pub async fn read_file_content(path: String) -> Result<serde_json::Value, String> {
    let p = Path::new(&path);
    if !p.exists() {
        return Err("File not found".to_string());
    }
    let content = fs::read_to_string(p).map_err(|e| format!("Failed to read file: {}", e))?;
    Ok(serde_json::json!({
        "content": content,
        "filePath": path,
    }))
}

// ── History/Session Management ───────────────────────────────

fn get_history_dir() -> PathBuf {
    let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("/home/thetanav"));
    home.join(".edit").join("history")
}

fn hash_string(input: &str) -> String {
    let mut hasher = Sha1::new();
    hasher.update(input.as_bytes());
    let result = hasher.finalize();
    hex::encode(&result[..5]) // 10 hex chars
}

fn to_safe_dir_name(session_path: &str) -> String {
    let sanitized: String = session_path
        .chars()
        .map(|c| if c.is_alphanumeric() { c } else { '_' })
        .take(60)
        .collect();
    format!("{}_{}", sanitized, hash_string(session_path))
}

fn get_history_dir_path(session_path: &str) -> PathBuf {
    get_history_dir().join(to_safe_dir_name(session_path))
}

fn get_session_file_path(session_path: &str, session_id: &str) -> PathBuf {
    get_history_dir_path(session_path).join(format!("{}.json", session_id))
}

fn ensure_dir(dir: &Path) {
    if !dir.exists() {
        let _ = fs::create_dir_all(dir);
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ChatMessage {
    pub id: String,
    pub role: String,
    pub content: String,
    pub timestamp: u64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ChatSession {
    pub id: String,
    pub name: String,
    pub path: String,
    pub messages: Vec<ChatMessage>,
    pub created_at: u64,
    pub updated_at: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub session_key: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_remote_enabled: Option<bool>,
}

fn list_all_session_files() -> Vec<PathBuf> {
    let history_dir = get_history_dir();
    ensure_dir(&history_dir);

    let mut files = Vec::new();
    if let Ok(entries) = fs::read_dir(&history_dir) {
        for entry in entries.flatten() {
            let full_path = entry.path();
            if full_path.is_file()
                && full_path
                    .extension()
                    .map(|e| e == "json")
                    .unwrap_or(false)
            {
                files.push(full_path);
                continue;
            }
            if full_path.is_dir() {
                if let Ok(dir_entries) = fs::read_dir(&full_path) {
                    for de in dir_entries.flatten() {
                        let fp = de.path();
                        if fp.is_file()
                            && fp.extension().map(|e| e == "json").unwrap_or(false)
                        {
                            files.push(fp);
                        }
                    }
                }
            }
        }
    }
    files
}

fn read_session(file_path: &Path) -> Option<ChatSession> {
    let content = fs::read_to_string(file_path).ok()?;
    serde_json::from_str(&content).ok()
}

#[tauri::command]
pub async fn get_sessions(key: Option<String>) -> Result<serde_json::Value, String> {
    let session_files = list_all_session_files();
    let mut sessions: Vec<ChatSession> = Vec::new();

    for file_path in &session_files {
        if let Some(session) = read_session(file_path) {
            sessions.push(session);
        }
    }

    if let Some(k) = key {
        let mut matching: Vec<&ChatSession> = sessions
            .iter()
            .filter(|s| s.session_key.as_deref() == Some(&k))
            .collect();
        matching.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
        if let Some(s) = matching.first() {
            return Ok(serde_json::to_value(s).unwrap());
        }
        return Err("Session not found".to_string());
    }

    sessions.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    Ok(serde_json::to_value(&sessions).unwrap())
}

#[tauri::command]
pub async fn save_session(session: ChatSession) -> Result<serde_json::Value, String> {
    let history_dir = get_history_dir();
    ensure_dir(&history_dir);
    let dir_path = get_history_dir_path(&session.path);
    ensure_dir(&dir_path);
    let file_path = get_session_file_path(&session.path, &session.id);

    let json = serde_json::to_string_pretty(&session)
        .map_err(|e| format!("Failed to serialize session: {}", e))?;
    fs::write(&file_path, json).map_err(|e| format!("Failed to write session: {}", e))?;

    Ok(serde_json::json!({ "success": true }))
}

#[tauri::command]
pub async fn delete_session(
    session_path: String,
    session_id: Option<String>,
) -> Result<serde_json::Value, String> {
    if let Some(sid) = session_id {
        let file_path = get_session_file_path(&session_path, &sid);
        if file_path.exists() {
            let _ = fs::remove_file(&file_path);
        }
        return Ok(serde_json::json!({ "success": true }));
    }

    // Delete all sessions for path
    let sanitized: String = session_path
        .chars()
        .map(|c| if c.is_alphanumeric() { c } else { '_' })
        .collect();
    let legacy_flat = get_history_dir().join(format!("{}.json", sanitized));
    if legacy_flat.exists() {
        let _ = fs::remove_file(&legacy_flat);
    }

    let dir_path = get_history_dir_path(&session_path);
    if dir_path.exists() {
        if let Ok(entries) = fs::read_dir(&dir_path) {
            for entry in entries.flatten() {
                let p = entry.path();
                if p.extension().map(|e| e == "json").unwrap_or(false) {
                    let _ = fs::remove_file(&p);
                }
            }
        }
        let _ = fs::remove_dir(&dir_path);
    }

    Ok(serde_json::json!({ "success": true }))
}

// ── Glob File Search ─────────────────────────────────────────

#[derive(Debug, Serialize)]
struct FileEntry {
    name: String,
    path: String,
    is_directory: bool,
    children: Vec<FileEntry>,
}

fn get_files_recursive(dir_path: &Path) -> Vec<FileEntry> {
    let entries = match fs::read_dir(dir_path) {
        Ok(e) => e,
        Err(_) => return Vec::new(),
    };

    let mut result = Vec::new();
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        let full_path = entry.path();

        if should_ignore(&name, TOOL_IGNORE_PATTERNS) {
            continue;
        }

        let is_dir = full_path.is_dir();
        let children = if is_dir {
            get_files_recursive(&full_path)
        } else {
            Vec::new()
        };

        result.push(FileEntry {
            name,
            path: full_path.to_string_lossy().to_string(),
            is_directory: is_dir,
            children,
        });
    }

    result.sort_by(|a, b| {
        if a.is_directory && !b.is_directory {
            std::cmp::Ordering::Less
        } else if !a.is_directory && b.is_directory {
            std::cmp::Ordering::Greater
        } else {
            a.name.to_lowercase().cmp(&b.name.to_lowercase())
        }
    });

    result
}

fn matches_glob_pattern(name: &str, pattern: &str) -> bool {
    let regex_pattern = pattern
        .replace('.', "\\.")
        .replace("**", ".*")
        .replace('*', "[^/]*")
        .replace('?', ".");
    regex::Regex::new(&format!("^{}$", regex_pattern))
        .map(|r| r.is_match(name))
        .unwrap_or(false)
}

fn find_glob_matches(files: &[FileEntry], pattern_parts: &[&str]) -> Vec<String> {
    let mut matches = Vec::new();

    if pattern_parts.is_empty() {
        for file in files {
            matches.push(file.path.clone());
        }
        return matches;
    }

    let current_part = pattern_parts[0];
    let rest_parts = &pattern_parts[1..];

    if current_part == "**" {
        for file in files {
            if file.is_directory {
                matches.push(file.path.clone());
                matches.extend(find_glob_matches(&file.children, pattern_parts));
            } else {
                // For **, also check if the rest matches the file name
                if rest_parts.is_empty() {
                    matches.push(file.path.clone());
                } else if rest_parts.len() == 1 && matches_glob_pattern(&file.name, rest_parts[0])
                {
                    matches.push(file.path.clone());
                }
            }
        }
        return matches;
    }

    for file in files {
        if file.is_directory && matches_glob_pattern(&file.name, current_part) {
            matches.extend(find_glob_matches(&file.children, rest_parts));
        } else if !file.is_directory && matches_glob_pattern(&file.name, current_part) {
            matches.push(file.path.clone());
        }
    }

    matches
}

#[tauri::command]
pub async fn glob_search(workspace_path: String, pattern: String) -> Result<serde_json::Value, String> {
    let files = get_files_recursive(Path::new(&workspace_path));
    let pattern_parts: Vec<&str> = pattern.split('/').collect();
    let all_matches = find_glob_matches(&files, &pattern_parts);
    let total = all_matches.len();
    let limited: Vec<&String> = all_matches.iter().take(50).collect();

    Ok(serde_json::json!({
        "files": limited,
        "total": total,
    }))
}

// ── Read Tool ────────────────────────────────────────────────

#[tauri::command]
pub async fn tool_read(
    workspace_path: String,
    file_path: String,
    offset: Option<usize>,
    limit: Option<usize>,
) -> Result<serde_json::Value, String> {
    let full_path = if Path::new(&file_path).is_absolute() {
        PathBuf::from(&file_path)
    } else {
        Path::new(&workspace_path).join(&file_path)
    };

    if !full_path.exists() {
        return Ok(serde_json::json!({ "error": format!("File not found: {}", full_path.display()) }));
    }

    let content = fs::read_to_string(&full_path)
        .map_err(|e| format!("Failed to read file: {}", e))?;
    let lines: Vec<&str> = content.split('\n').collect();
    let total_lines = lines.len();

    let start_offset = offset.map(|o| o.saturating_sub(1)).unwrap_or(0);
    let end_offset = limit
        .map(|l| (start_offset + l).min(lines.len()))
        .unwrap_or(lines.len());
    let selected_lines = &lines[start_offset..end_offset];
    let size = fs::metadata(&full_path).map(|m| m.len()).unwrap_or(0);

    Ok(serde_json::json!({
        "filePath": full_path.to_string_lossy(),
        "content": selected_lines.join("\n"),
        "range": format!("{}-{}", start_offset + 1, end_offset),
        "totalLines": total_lines,
        "size": size,
    }))
}

// ── Write Tool ───────────────────────────────────────────────

#[tauri::command]
pub async fn tool_write(
    workspace_path: String,
    file_path: String,
    content: String,
) -> Result<serde_json::Value, String> {
    let full_path = if Path::new(&file_path).is_absolute() {
        PathBuf::from(&file_path)
    } else {
        Path::new(&workspace_path).join(&file_path)
    };

    let dir = full_path
        .parent()
        .ok_or_else(|| "Invalid file path".to_string())?;
    if !dir.exists() {
        fs::create_dir_all(dir).map_err(|e| format!("Failed to create directory: {}", e))?;
    }

    let existed = full_path.exists();
    let previous_content = if existed {
        fs::read_to_string(&full_path).ok()
    } else {
        None
    };
    let previous_line_count = previous_content
        .as_ref()
        .map(|c| c.split('\n').count())
        .unwrap_or(0);

    fs::write(&full_path, &content).map_err(|e| format!("Failed to write file: {}", e))?;
    let new_line_count = content.split('\n').count();

    Ok(serde_json::json!({
        "filePath": full_path.to_string_lossy(),
        "action": if existed { "edited" } else { "created" },
        "existedBefore": existed,
        "previousContent": previous_content,
        "previousLineCount": previous_line_count,
        "newLineCount": new_line_count,
        "linesAdded": new_line_count as isize - previous_line_count as isize,
        "linesRemoved": if existed { previous_line_count } else { 0 },
    }))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RestoreFileEdit {
    pub file_path: String,
    pub action: String,
    pub previous_content: Option<String>,
    pub existed_before: Option<bool>,
}

#[tauri::command]
pub async fn restore_file_edits(
    workspace_path: String,
    edits: Vec<RestoreFileEdit>,
) -> Result<serde_json::Value, String> {
    let mut restored: Vec<String> = Vec::new();
    let mut skipped: Vec<String> = Vec::new();
    let mut errors: Vec<String> = Vec::new();

    for edit in edits {
        let full_path = if Path::new(&edit.file_path).is_absolute() {
            PathBuf::from(&edit.file_path)
        } else {
            Path::new(&workspace_path).join(&edit.file_path)
        };

        if edit.action == "created" {
            if full_path.exists() {
                match fs::remove_file(&full_path) {
                    Ok(_) => restored.push(full_path.to_string_lossy().to_string()),
                    Err(e) => errors.push(format!(
                        "Failed to delete {}: {}",
                        full_path.to_string_lossy(),
                        e
                    )),
                }
            } else {
                skipped.push(full_path.to_string_lossy().to_string());
            }
            continue;
        }

        match edit.previous_content {
            Some(prev) => {
                if let Some(parent) = full_path.parent() {
                    if !parent.exists() {
                        if let Err(e) = fs::create_dir_all(parent) {
                            errors.push(format!(
                                "Failed to create parent dir for {}: {}",
                                full_path.to_string_lossy(),
                                e
                            ));
                            continue;
                        }
                    }
                }

                match fs::write(&full_path, prev) {
                    Ok(_) => restored.push(full_path.to_string_lossy().to_string()),
                    Err(e) => errors.push(format!(
                        "Failed to restore {}: {}",
                        full_path.to_string_lossy(),
                        e
                    )),
                }
            }
            None => {
                if edit.existed_before.unwrap_or(false) {
                    errors.push(format!(
                        "Missing previous content for {}",
                        full_path.to_string_lossy()
                    ));
                } else {
                    skipped.push(full_path.to_string_lossy().to_string());
                }
            }
        }
    }

    Ok(serde_json::json!({
        "success": errors.is_empty(),
        "restored": restored,
        "skipped": skipped,
        "errors": errors,
    }))
}

// ── Bash Tool ────────────────────────────────────────────────

#[tauri::command]
pub async fn tool_bash(
    workspace_path: String,
    command: String,
    timeout_ms: Option<u64>,
) -> Result<serde_json::Value, String> {
    let _timeout = std::time::Duration::from_millis(timeout_ms.unwrap_or(60000));

    let output = Command::new("sh")
        .arg("-c")
        .arg(&command)
        .current_dir(&workspace_path)
        .output();

    match output {
        Ok(o) => {
            let stdout = String::from_utf8_lossy(&o.stdout).to_string();
            let stderr = String::from_utf8_lossy(&o.stderr).to_string();

            if o.status.success() {
                Ok(serde_json::json!({
                    "stdout": stdout,
                    "path": workspace_path,
                }))
            } else {
                Ok(serde_json::json!({
                    "stdout": stdout,
                    "stderr": stderr,
                    "error": format!("Command exited with status: {}", o.status),
                    "path": workspace_path,
                }))
            }
        }
        Err(e) => Ok(serde_json::json!({
            "stdout": "",
            "stderr": e.to_string(),
            "error": e.to_string(),
            "path": workspace_path,
        })),
    }
}

// ── AI Chat (Ollama HTTP API) ────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct OllamaMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ToolFunction {
    pub name: String,
    pub description: String,
    pub parameters: serde_json::Value,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct OllamaTool {
    #[serde(rename = "type")]
    pub tool_type: String,
    pub function: ToolFunction,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct OllamaToolCall {
    pub function: OllamaToolCallFunction,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct OllamaToolCallFunction {
    pub name: String,
    pub arguments: serde_json::Value,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct OllamaStreamResponse {
    #[serde(default)]
    message: Option<OllamaStreamMessage>,
    #[serde(default)]
    done: bool,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct OllamaStreamMessage {
    #[serde(default)]
    role: String,
    #[serde(default)]
    content: String,
    #[serde(default)]
    tool_calls: Option<Vec<OllamaToolCall>>,
}

fn get_system_prompt(workspace_path: &str) -> String {
    let ignore_patterns = TOOL_IGNORE_PATTERNS
        .iter()
        .map(|p| format!("- {}", p))
        .collect::<Vec<_>>()
        .join("\n");

    format!(
        r#"You are a powerful coding assistant/general agent. Think carefully before acting.

## Workspace
The working directory is: {}
All file paths can be relative to this directory.

## Ignore Patterns (DO NOT read/edit these)
The following patterns are automatically ignored to avoid massive context:
{}

## Tool Usage Guidelines

### Reading Files
- Always read a file before editing it to get accurate line numbers.
- For large files, read in chunks using offset and limit.
- You can use relative paths (e.g., "src/index.ts") instead of absolute paths.
- NEVER read files matching ignore patterns (node_modules, .git, build dirs, etc.).

### Editing Files
- Always read the file first to see current content and line numbers.
- Use the write tool to write full file content.
- Edits are applied directly to disk — be precise.

### Running Commands
- Use the bash tool to run shell commands when needed.
- Commands execute in the workspace directory.

### Searching Files
- Use the glob tool to find files by pattern (e.g., "**/*.ts").
- Glob results are sorted by modification time, most recent first.
- Glob automatically excludes ignored patterns.

## Response Guidelines
- Be concise and direct. Avoid unnecessary explanations.
- Only address the specific query or task at hand.
- When giving file paths, include line numbers (e.g., "src/index.ts:42").
- Never output text like "Here is..." or "Based on the information..."
- One-word answers are best when appropriate."#,
        workspace_path, ignore_patterns
    )
}

fn get_ollama_tools() -> Vec<OllamaTool> {
    vec![
        OllamaTool {
            tool_type: "function".to_string(),
            function: ToolFunction {
                name: "glob".to_string(),
                description: "Search for files by pattern in the workspace".to_string(),
                parameters: serde_json::json!({
                    "type": "object",
                    "properties": {
                        "pattern": {
                            "type": "string",
                            "description": "The glob pattern to search for (e.g., '**/*.ts')"
                        }
                    },
                    "required": ["pattern"]
                }),
            },
        },
        OllamaTool {
            tool_type: "function".to_string(),
            function: ToolFunction {
                name: "read".to_string(),
                description: "Read the contents of a file".to_string(),
                parameters: serde_json::json!({
                    "type": "object",
                    "properties": {
                        "filePath": {
                            "type": "string",
                            "description": "The path to the file to read"
                        },
                        "offset": {
                            "type": "number",
                            "description": "The line number to start reading from"
                        },
                        "limit": {
                            "type": "number",
                            "description": "The number of lines to read"
                        }
                    },
                    "required": ["filePath"]
                }),
            },
        },
        OllamaTool {
            tool_type: "function".to_string(),
            function: ToolFunction {
                name: "write".to_string(),
                description: "Write content to a file".to_string(),
                parameters: serde_json::json!({
                    "type": "object",
                    "properties": {
                        "filePath": {
                            "type": "string",
                            "description": "The path to the file to write"
                        },
                        "content": {
                            "type": "string",
                            "description": "The content to write to the file"
                        }
                    },
                    "required": ["filePath", "content"]
                }),
            },
        },
        OllamaTool {
            tool_type: "function".to_string(),
            function: ToolFunction {
                name: "bash".to_string(),
                description: "Execute a shell command in the workspace".to_string(),
                parameters: serde_json::json!({
                    "type": "object",
                    "properties": {
                        "command": {
                            "type": "string",
                            "description": "The command to execute"
                        },
                        "timeout": {
                            "type": "number",
                            "description": "Timeout in milliseconds"
                        }
                    },
                    "required": ["command"]
                }),
            },
        },
    ]
}

async fn execute_tool(
    workspace_path: &str,
    tool_name: &str,
    arguments: &serde_json::Value,
) -> serde_json::Value {
    match tool_name {
        "glob" => {
            let pattern = arguments
                .get("pattern")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            match glob_search(workspace_path.to_string(), pattern).await {
                Ok(v) => v,
                Err(e) => serde_json::json!({ "error": e }),
            }
        }
        "read" => {
            let file_path = arguments
                .get("filePath")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let offset = arguments.get("offset").and_then(|v| v.as_u64()).map(|v| v as usize);
            let limit = arguments.get("limit").and_then(|v| v.as_u64()).map(|v| v as usize);
            match tool_read(workspace_path.to_string(), file_path, offset, limit).await {
                Ok(v) => v,
                Err(e) => serde_json::json!({ "error": e }),
            }
        }
        "write" => {
            let file_path = arguments
                .get("filePath")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let content = arguments
                .get("content")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            match tool_write(workspace_path.to_string(), file_path, content).await {
                Ok(v) => v,
                Err(e) => serde_json::json!({ "error": e }),
            }
        }
        "bash" => {
            let command = arguments
                .get("command")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let timeout = arguments
                .get("timeout")
                .and_then(|v| v.as_u64());
            match tool_bash(workspace_path.to_string(), command, timeout).await {
                Ok(v) => v,
                Err(e) => serde_json::json!({ "error": e }),
            }
        }
        _ => serde_json::json!({ "error": format!("Unknown tool: {}", tool_name) }),
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ChatStreamEvent {
    #[serde(rename = "type")]
    pub event_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_call_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_input: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_output: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub needs_approval: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ChatRequest {
    pub messages: Vec<OllamaMessage>,
    pub workspace_path: String,
    pub chat_id: String,
    pub model: Option<String>,
}

#[tauri::command]
pub async fn send_chat_message(
    app: AppHandle,
    request: ChatRequest,
) -> Result<(), String> {
    let chat_id = request.chat_id.clone();
    let workspace_path = request.workspace_path.clone();
    let model = request.model.unwrap_or_else(|| "qwen3:32b".to_string());

    let event_name = format!("chat-stream-{}", chat_id);

    tokio::spawn(async move {
        let result = run_chat_loop(&app, &event_name, &workspace_path, &model, request.messages).await;
        if let Err(e) = result {
            let _ = app.emit(
                &event_name,
                ChatStreamEvent {
                    event_type: "error".to_string(),
                    content: None,
                    tool_name: None,
                    tool_call_id: None,
                    tool_input: None,
                    tool_output: None,
                    error: Some(e),
                    needs_approval: None,
                },
            );
        }
        let _ = app.emit(
            &event_name,
            ChatStreamEvent {
                event_type: "done".to_string(),
                content: None,
                tool_name: None,
                tool_call_id: None,
                tool_input: None,
                tool_output: None,
                error: None,
                needs_approval: None,
            },
        );
    });

    Ok(())
}

async fn run_chat_loop(
    app: &AppHandle,
    event_name: &str,
    workspace_path: &str,
    model: &str,
    initial_messages: Vec<OllamaMessage>,
) -> Result<(), String> {
    let client = reqwest::Client::new();
    let system_prompt = get_system_prompt(workspace_path);
    let tools = get_ollama_tools();

    let mut messages = vec![OllamaMessage {
        role: "system".to_string(),
        content: system_prompt,
    }];
    messages.extend(initial_messages);

    let max_steps = 20;

    for _step in 0..max_steps {
        // Make the API call to Ollama (non-streaming for tool support)
        let body = serde_json::json!({
            "model": model,
            "messages": messages,
            "tools": tools,
            "stream": false,
        });

        let response = client
            .post("http://localhost:11434/api/chat")
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Failed to connect to Ollama: {}. Is Ollama running?", e))?;

        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().await.unwrap_or_default();
            return Err(format!("Ollama returned error {}: {}", status, text));
        }

        let resp_body: serde_json::Value = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse Ollama response: {}", e))?;

        let message = resp_body
            .get("message")
            .ok_or("No message in Ollama response")?;

        let content = message
            .get("content")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();

        let tool_calls: Vec<OllamaToolCall> = message
            .get("tool_calls")
            .and_then(|v| serde_json::from_value(v.clone()).ok())
            .unwrap_or_default();

        // Emit text content if present
        if !content.is_empty() {
            let _ = app.emit(
                event_name,
                ChatStreamEvent {
                    event_type: "text".to_string(),
                    content: Some(content.clone()),
                    tool_name: None,
                    tool_call_id: None,
                    tool_input: None,
                    tool_output: None,
                    error: None,
                    needs_approval: None,
                },
            );
        }

        // Add assistant message to history
        messages.push(OllamaMessage {
            role: "assistant".to_string(),
            content: content.clone(),
        });

        // If no tool calls, we're done
        if tool_calls.is_empty() {
            break;
        }

        // Execute tool calls
        for tool_call in &tool_calls {
            let tool_name = &tool_call.function.name;
            let arguments = &tool_call.function.arguments;
            let tool_call_id = format!(
                "call-{}-{}",
                tool_name,
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_millis()
            );

            let needs_approval = tool_name == "write" || tool_name == "bash";

            // Emit tool call event
            let _ = app.emit(
                event_name,
                ChatStreamEvent {
                    event_type: "tool-call".to_string(),
                    content: None,
                    tool_name: Some(tool_name.clone()),
                    tool_call_id: Some(tool_call_id.clone()),
                    tool_input: Some(arguments.clone()),
                    tool_output: None,
                    error: None,
                    needs_approval: Some(needs_approval),
                },
            );

            if needs_approval {
                // Wait for approval from frontend
                let approval = wait_for_approval(app, &tool_call_id).await;

                if !approval {
                    // Emit denied
                    let _ = app.emit(
                        event_name,
                        ChatStreamEvent {
                            event_type: "tool-denied".to_string(),
                            content: None,
                            tool_name: Some(tool_name.clone()),
                            tool_call_id: Some(tool_call_id.clone()),
                            tool_input: None,
                            tool_output: None,
                            error: None,
                            needs_approval: None,
                        },
                    );

                    messages.push(OllamaMessage {
                        role: "tool".to_string(),
                        content: serde_json::json!({ "error": "Tool execution was denied by the user" }).to_string(),
                    });
                    continue;
                }
            }

            // Execute the tool
            let tool_result = execute_tool(workspace_path, tool_name, arguments).await;

            // Emit tool output
            let _ = app.emit(
                event_name,
                ChatStreamEvent {
                    event_type: "tool-output".to_string(),
                    content: None,
                    tool_name: Some(tool_name.clone()),
                    tool_call_id: Some(tool_call_id.clone()),
                    tool_input: Some(arguments.clone()),
                    tool_output: Some(tool_result.clone()),
                    error: None,
                    needs_approval: None,
                },
            );

            // Add tool result to messages for next iteration
            messages.push(OllamaMessage {
                role: "tool".to_string(),
                content: tool_result.to_string(),
            });
        }
    }

    Ok(())
}

use std::sync::Mutex;
use std::collections::HashMap;
use once_cell::sync::Lazy;

static APPROVAL_MAP: Lazy<Mutex<HashMap<String, Option<bool>>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));

#[tauri::command]
pub async fn approve_tool_call(tool_call_id: String, approved: bool) -> Result<(), String> {
    let mut map = APPROVAL_MAP.lock().map_err(|e| e.to_string())?;
    map.insert(tool_call_id, Some(approved));
    Ok(())
}

async fn wait_for_approval(_app: &AppHandle, tool_call_id: &str) -> bool {
    // Register the pending approval
    {
        let mut map = APPROVAL_MAP.lock().unwrap();
        map.insert(tool_call_id.to_string(), None);
    }

    // Poll for approval (with timeout)
    let timeout = std::time::Duration::from_secs(300); // 5 minute timeout
    let start = std::time::Instant::now();

    loop {
        {
            let map = APPROVAL_MAP.lock().unwrap();
            if let Some(Some(approved)) = map.get(tool_call_id) {
                let result = *approved;
                drop(map);
                // Clean up
                let mut map = APPROVAL_MAP.lock().unwrap();
                map.remove(tool_call_id);
                return result;
            }
        }

        if start.elapsed() > timeout {
            let mut map = APPROVAL_MAP.lock().unwrap();
            map.remove(tool_call_id);
            return false;
        }

        tokio::time::sleep(std::time::Duration::from_millis(100)).await;
    }
}

#[tauri::command]
pub async fn stop_chat(chat_id: String) -> Result<(), String> {
    // For now, we'll track this via a global map too
    let mut map = STOP_MAP.lock().map_err(|e| e.to_string())?;
    map.insert(chat_id, true);
    Ok(())
}

static STOP_MAP: Lazy<Mutex<HashMap<String, bool>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));
