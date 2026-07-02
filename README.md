# Edit

<p align="center">
  <strong>An AI-powered coding assistant with a rich web IDE interface for interactive, agentic code editing.</strong>
</p>

<div align="center">
  <img src="screenshot.png" alt="Edit Screenshot" width="800" />
  <p><em>(Screenshot needed — see <a href="#screenshots">Screenshots</a>)</em></p>
</div>

## Why Edit?

- **Chat-driven development** — Describe what you want in plain English, and the AI writes your code
- **Full project awareness** — Browse your entire codebase through an intuitive file tree with git status indicators
- **Built-in safety** — Shell commands require your approval before execution
- **Local & private** — Runs entirely on your machine with Ollama. No data leaves your computer
- **Multi-tool AI agent** — The AI can read, search, edit files, run commands, glob patterns, and even control a browser
- **Terminal, browser, and Git — all in one place** — Full PTY terminal emulator, headless browser viewport, and Git integration

## Features

### 🤖 AI Agent with Tool Access

The AI acts as an autonomous coding agent with these built-in tools:

| Tool | Description | Needs Approval |
|------|-------------|---------------|
| `ls` | List files/directories in the workspace (configurable depth) | No |
| `glob` | Find files by glob patterns | No |
| `read` | Read file contents with optional offset/limit | No |
| `edit` | Edit or create files using string replacement (with unified diffs) | No |
| `grep` | Search file contents via ripgrep | No |
| `bash` | Run shell commands in your workspace | **Yes** |
| `scrape` | Fetch URLs and extract text content | No |

The AI can chain multiple tool calls in sequence (up to 100 steps) to complete complex tasks autonomously.

### 🖥️ Full IDE Interface

- **File Tree Explorer** — Browse your project with `@pierre/trees` (virtualized, performant). Shows git status indicators (added, modified, deleted, renamed, untracked)
- **File Viewer** — Monaco-based code viewer with syntax highlighting and diff rendering via `@pierre/diffs`
- **Bottom Terminal** — Multi-tab PTY terminal emulator powered by `bun-pty` + `@wterm/react` with WebSocket streaming
- **Right Sidebar** — Toggle between file tree and integrated browser viewport
- **Chat Sidebar** — Session history grouped by workspace path

### 🌐 Integrated Browser

- Headless browser via `agent-browser` CLI with live screencast (JPEG frames over WebSocket)
- Click, keyboard, scroll, and touch event forwarding
- Navigate, reload, and manage browser history directly from the UI
- Shared browser session across your workspace

### 🔧 Git Integration

- **Status** — View changed files with porcelain status codes
- **Commit** — Stage all changes with auto-generated commit messages (via LLM) or custom messages
- **Push / Pull** — Remote operations at the click of a button
- **Branch Management** — List, switch, and initialize git branches
- **Remote Info** — View remotes, ahead/behind counts, current branch, and short hash
- **Real-time updates** — WebSocket broadcasts `git-status-changed` events

### 💬 Rich Chat Experience

- **Streaming responses** — Real-time token streaming via Vercel AI SDK with smooth chunking
- **@ file mentions** — Type `@` in chat input for file path autocompletion from the workspace
- **Tool call rendering** — Collapsible UI cards for every AI tool invocation (reads, edits, commands, etc.)
- **Approval UI** — Inline Approve/Decline buttons for destructive operations (bash commands)
- **Message queuing** — Send messages while the AI is streaming; they auto-send when it finishes
- **Streamdown rendering** — Rich markdown rendering with code blocks, math, Mermaid diagrams, CJK support, and ANSI colors

### 🗄️ Persistent Sessions

- SQLite-backed chat history with Drizzle ORM
- Sessions persist across page reloads and browser restarts
- Sessions are grouped by workspace path for easy navigation
- Create, switch, and delete sessions from the sidebar

## Demo

<!-- Add screenshots or a GIF here -->

> **Tip:** Spin it up locally with `bun run dev` and point it at any project directory to see it in action.

## Architecture

### How the AI Works

```
User Message
    │
    ▼
POST /api/chat (Elysia)
    │
    ├─ Store user message in SQLite
    ├─ Build tool definitions (ls, glob, read, edit, grep, bash, scrape)
    ├─ Build system prompt with workspace context
    │
    ▼
streamText() via Vercel AI SDK + Ollama
    │
    ├─ AI reasons about the task
    ├─ Calls tools (file ops, search, shell)
    │   └─ bash tool requires UI approval via needsApproval
    ├─ Streaming response sent to frontend
    │
    ▼
Frontend renders (useChat from @ai-sdk/react)
    ├─ Text via Streamdown (rich markdown + code + math + mermaid)
    ├─ Tool calls as collapsible cards
    └─ Diffs via @pierre/diffs
```

## Roadmap

- [ ] Windows compatibility for terminal PTY
- [ ] Resizable panels
- [ ] Electron desktop app
- [ ] Multi-model support
- [ ] Extension/plugin system

## License

MIT

---

<div align="center">
  <sub>Built with Bun, React, Elysia, and Ollama.</sub>
</div>
