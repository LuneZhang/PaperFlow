# LocalScholar 📚

<p align="right">
  <a href="./README.md">🇺🇸 English</a> | <a href="./README_zh.md">🇨🇳 中文</a>
</p>

LocalScholar is a desktop-first AI paper organizer for researchers who want to convert messy PDF collections into a clean, reproducible local library.

It performs the full pipeline: extract PDF text, infer metadata with LLMs, then apply real file organization on disk.

## 🎯 Project Purpose

If your files look like `paper_final_v3.pdf`, `arxiv-2024.pdf`, or `supplement.pdf`, LocalScholar helps normalize them into a long-term maintainable structure.

## 📦 Input -> Output

- **Input**: one or many PDFs (drag/drop, file upload, or folder import)
- **Processing**: local PDF parsing + LLM metadata extraction
- **Output**: organized files under your chosen library root
  - `Category / Journal / Year / Filename.pdf`
- **Safety**: `auto_rename` for collisions + rollback for the latest operation

## 🚀 User Guide

### 1) Install and Open

1. Download the desktop installer from GitHub Releases (`.msi`, `.dmg`, `.AppImage`/`.deb`, etc.).
2. Install and launch LocalScholar.

### 2) Configure AI Provider

1. Open **Settings**.
2. Choose your provider (Gemini/OpenAI/DeepSeek/Azure/Ollama).
3. Fill required fields (API key, endpoint/base URL, model).
4. Run connection test if needed.

### 3) Set Your Library Root

1. In the main panel, set `Library` root path (manual input or folder picker).
2. Use a directory outside your git repo, for example:
   - Windows: `D:\\LocalScholarLibrary`
   - Linux/macOS: `/data/LocalScholarLibrary`

### 4) Import PDFs

1. Drag PDFs into the drop zone, or
2. Upload files, or
3. Import a whole folder to auto-discover PDFs.

### 5) Wait for Analysis

Each file moves through `QUEUED -> READING -> ANALYZING -> COMPLETED`.

### 6) One-Click Organize

1. Click **一键整理**.
2. Check the result panel:
   - `organized`: newly organized files
   - `skipped`: already managed files (same content hash)
   - `auto_rename`: collision-resolved renamed files

### 7) Rollback When Needed

1. Click **预览回滚** to inspect what will be reverted.
2. Click **回滚上次** to undo the latest organization batch.

### 8) Verify on Disk

Your organized structure will appear under the chosen library root. App state is saved in:

- `.localscholar/state.json`
- `.localscholar/rollback/`

## ✨ Core Capabilities

- 🔍 Local PDF extraction via `pdf.js`
- 🤖 Multi-provider LLM metadata extraction
- 🗂 Native desktop local file organization
- 🧠 Incremental skip by content hash
- 🛡 `auto_rename` collision handling
- ♻️ Rollback preview and apply

## ⚠️ Scope & Limits

- Native file organization is available in desktop mode.
- Metadata quality depends on PDF text quality and model output quality.
- LocalScholar focuses on local file organization, not citation graph management or cloud sync.

## 🧑‍💻 Developer Notes

### Prerequisites

- Node.js 20+
- Rust (`cargo`, `rustc`)
- Tauri system dependencies (Linux requires `pkg-config` + GTK/WebKit dev libraries)

### Commands

```bash
npm install
npm run dev         # Web mode (analysis/UI)
npm run tauri:dev   # Desktop mode (full local file operations)
npm run build
npm run tauri:build
```

## 🔐 Security Notes

- Never commit `.env` or API keys.
- Prefer selecting a library path outside your source repository.

## 📄 License

MIT
