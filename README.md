# Edit

<p align="center">
  <strong>An AI-powered coding assistant with a stunning web interface for interactive code editing.</strong>
</p>

<p align="center">
  <a href="#features">Features</a> •
  <a href="#getting-started">Getting Started</a> •
  <a href="#demo">Demo</a> •
  <a href="#tech-stack">Tech Stack</a>
</p>

![Screenshot](screenshot.png)

## Why Edit?

- **Chat-driven development** — Describe what you want in plain English, and watch the AI write your code
- **Full project awareness** — Browse your entire codebase through an intuitive file tree
- **Built-in safety** — Review every change before it's applied with the approval system
- **Local & private** — Runs entirely on your machine with Ollama. No data leaves your computer
- **Web search enabled** — Debug faster by searching Stack Overflow and docs without leaving the app

## Features

- **Visual File Tree** — Browse and navigate your project files with a beautiful, responsive explorer
- **Interactive Chat** — Natural language coding assistant with real-time streaming responses
- **File Operations** — Read, write, and edit files with AI assistance
- **Web Search** — Search the web for documentation and solutions
- **Approval System** — Review destructive operations before they execute
- **Edit History** — Track and review all changes made during the session

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) (recommended) or Node.js
- [Ollama](https://ollama.ai) running locally with your preferred model

### Quick Start

```bash
# Clone the repository
git clone <repo-url>
cd edit

# Install dependencies
bun install

# Start the development server
bun run dev
```

Open [http://localhost:3000](http://localhost:3000) and select a workspace directory to begin.

### Web Search (Optional)

To enable web search functionality, add a Tavily API key:

```bash
# Create .env.local
echo "TAVILY_API_KEY=your_api_key_here" > .env.local
```

## Usage

1. **Select a workspace** — Choose the directory you want to work in
2. **Chat with the AI** — Ask questions, request edits, or get help debugging
3. **Review changes** — Approve file modifications before they're applied
4. **Browse files** — Click files in the tree to view their contents

## Project Structure

```
├── app/                    # Next.js app router
│   ├── api/chat/route.ts  # AI chat API endpoint
│   ├── layout.tsx         # Root layout
│   └── page.tsx           # Main interface
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

- **Next.js 15** — React framework with App Router
- **Bun** — Fast JavaScript runtime and package manager
- **AI SDK** — Streaming AI responses with tool support
- **Ollama** — Local LLM integration
- **Tailwind CSS** — Utility-first styling
- **shadcn/ui** — Accessible UI components

## License

MIT
