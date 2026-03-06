# Edit

An AI-powered coding assistant packaged as a Tauri desktop app.

![Screenshot](screenshot.png)

## Features

- **Visual File Tree** - Browse and navigate your project files
- **Interactive Chat** - Natural language coding assistant with streaming responses
- **File Operations** - Read, write, and edit files with AI assistance
- **Web Search** - Search the web for documentation and solutions
- **Approval System** - Review destructive operations before they execute
- **Edit History** - Track all changes made during the session

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) (recommended) or Node.js
- [Ollama](https://ollama.ai) running locally with your preferred model

### Installation

```bash
# Clone the repository
git clone <repo-url>
cd edit

# Install dependencies
bun install

# Start the desktop app in development
bun run dev
```

This launches the Tauri desktop window.

### Build Desktop Binary

```bash
bun run build
```

### Optional: Web Search

To enable web search functionality, add a Tavily API key:

```bash
# Create .env.local
echo "TAVILY_API_KEY=your_api_key_here" > .env.local
```

## Usage

1. **Select a workspace** - Choose the directory you want to work in
2. **Chat with the AI** - Ask questions, request edits, or get help debugging
3. **Review changes** - Approve file modifications before they're applied
4. **Browse files** - Click files in the tree to view their contents

## Project Structure

```
├── app/                    # UI screens
│   ├── chat/page.tsx      # Chat interface
│   └── page.tsx           # Project/session selector
├── src/
│   ├── App.tsx            # React Router setup
│   └── main.tsx           # Vite app entrypoint
├── components/            # React components
│   ├── ai-elements/      # AI-specific UI (terminal, shimmer)
│   ├── ui/               # shadcn/ui components
│   ├── edits-panel.tsx   # Edit history sidebar
│   └── file-tree.tsx     # File explorer
├── lib/                   # Utilities and tools
│   ├── tool.ts           # AI tool definitions
│   └── utils.ts          # Helper functions
└── public/               # Static assets
```

## Tech Stack

- **Tauri + Vite + React** - Desktop runtime with lightweight frontend build
- **Bun** - Fast JavaScript runtime and package manager
- **AI SDK** - Streaming AI responses with tool support
- **Ollama** - Local LLM integration
- **Tailwind CSS** - Utility-first styling
- **shadcn/ui** - Accessible UI components

## License

MIT
