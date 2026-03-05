# LocalScholar 📚

<p align="right">
  <a href="./README.md">🇺🇸 English</a> | <a href="./README_zh.md">🇨🇳 中文</a>
</p>

LocalScholar 是一个桌面优先的 AI 论文整理工具，面向希望将混乱 PDF 文献库整理为可复现本地结构的研究者。

它覆盖完整流程：提取 PDF 文本、调用 LLM 生成元数据、并将结果真正应用到本地文件整理。

## 🎯 项目用途

如果你的文件名是 `paper_final_v3.pdf`、`arxiv-2024.pdf`、`supplement.pdf` 这类无序状态，LocalScholar 的目标是将其标准化为长期可维护的目录结构。

## 📦 输入 -> 输出

- **输入**：单个或批量 PDF（拖拽、文件上传、目录导入）
- **处理**：本地 PDF 解析 + LLM 元数据提取
- **输出**：在你指定的 Library 根目录中生成结构化文件
  - `分类 / 期刊 / 年份 / 文件名.pdf`
- **安全机制**：冲突 `auto_rename` + 最近一次整理可回滚

## 🚀 用户使用

### 1）安装并启动

1. 从 GitHub Releases 下载桌面安装包（如 `.msi`、`.dmg`、`.AppImage`/`.deb`）。
2. 安装并启动 LocalScholar。

### 2）配置 AI 供应商

1. 打开 **Settings（设置）**。
2. 选择供应商（Gemini/OpenAI/DeepSeek/Azure/Ollama）。
3. 填写必要参数（API Key、Endpoint/Base URL、Model）。
4. 需要时先做连通测试。

### 3）设置 Library 根目录

1. 在主界面填写 `Library` 根目录（可手输或目录选择）。
2. 建议放在 git 仓库之外，例如：
   - Windows：`D:\\LocalScholarLibrary`
   - Linux/macOS：`/data/LocalScholarLibrary`

### 4）导入 PDF

1. 拖拽 PDF 到上传区域，或
2. 手动上传文件，或
3. 选择目录并自动发现其中 PDF。

### 5）等待分析完成

每个文件会经历：`QUEUED -> READING -> ANALYZING -> COMPLETED`。

### 6）一键整理

1. 点击 **一键整理**。
2. 查看结果面板：
   - `organized`：本次成功整理文件数
   - `skipped`：已纳管文件（同内容哈希）
   - `auto_rename`：冲突后自动重命名文件

### 7）需要撤销时回滚

1. 点击 **预览回滚** 查看即将撤销的文件。
2. 点击 **回滚上次** 撤销最近一批整理。

### 8）在磁盘中核对结果

整理结果会写入你设置的 Library 根目录，状态数据在：

- `.localscholar/state.json`
- `.localscholar/rollback/`

## ✨ 核心能力

- 🔍 使用 `pdf.js` 本地提取 PDF 文本
- 🤖 多供应商 LLM 元数据提取
- 🗂 桌面端原生本地文件整理
- 🧠 基于内容哈希的增量跳过
- 🛡 `auto_rename` 冲突处理
- ♻️ 回滚预览与回滚执行

## ⚠️ 适用边界

- 原生本地文件整理能力在桌面模式可用。
- 元数据质量取决于 PDF 文本质量和模型输出质量。
- LocalScholar 专注文献本地文件整理，不是引文图谱管理或云同步系统。

## 🧑‍💻 开发者说明

### 前置依赖

- Node.js 20+
- Rust（`cargo`、`rustc`）
- Tauri 系统依赖（Linux 需安装 `pkg-config` + GTK/WebKit 开发库）

### 常用命令

```bash
npm install
npm run dev         # Web 模式（分析/UI）
npm run tauri:dev   # 桌面模式（完整本地文件操作）
npm run build
npm run tauri:build
```

## 🔐 安全说明

- 不要提交 `.env` 或任何 API Key。
- 建议将 Library 路径设置在源码仓库目录之外。

## 📄 License

MIT
