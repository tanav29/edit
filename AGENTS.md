# AGENTS.md - Development Guidelines for AI Coding Agents

This file contains essential guidelines for AI coding agents working on this Next.js-based AI coding assistant application.

## Project Overview

This is a **Next.js 16** application (App Router) that provides an AI-powered coding assistant with:
- File tree navigation and viewing
- AI chat interface with tool execution (read, write, glob, bash)
- Session management with local and remote sync
- JSON-Render based UI rendering

## Technology Stack

- **Runtime**: Bun
- **Framework**: Next.js 16.1.6 (App Router)
- **UI**: React 19.2.4, Tailwind CSS 4, shadcn/ui, radix-ui
- **AI**: @ai-sdk/react 3.0.88, ai package 6.0.86
- **Rendering**: @json-render/core 0.8.0, @json-render/react 0.8.0, @json-render/shadcn 0.8.0
- **Animation**: motion 12.34.0 (Framer Motion)
- **Icons**: lucide-react 0.575.0
- **Code Editor**: @monaco-editor/react 4.7.0

## Build, Lint, and Test Commands

### Running the Application
```bash
# Start the development server
bun run dev

# Build for production
bun run build

# Start production server
bun run start

# Run linting
bun run lint
```

### Testing
```bash
# Run tests (if configured)
bun test

# Run a specific test file
bun test src/path/to/test.test.ts
```

## Code Style Guidelines

### TypeScript Configuration
- **Strict mode**: Always enabled
- **Module resolution**: Bundler resolution
- **JSX**: React JSX transform
- **Module type**: ES modules

### Import Conventions
```typescript
// External dependencies first
import React from "react"
import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, Stack, Heading, Input } from "@/components/ui/card"

// Local imports
import { useChatStore } from "@/lib/chat-store"
import { createTools, DEFAULT_IGNORE_PATTERNS } from "@/lib/tool"
import { catalog } from "@/lib/catalog"
```

### Naming Conventions
- **Files**: PascalCase for components (`ChatPage.tsx`), camelCase for utilities (`chat-store.tsx`)
- **Components**: PascalCase (`FileTree`, `EditsPanel`)
- **Functions/Hooks**: camelCase (`useChatStore`, `createTools`)
- **Types/Interfaces**: PascalCase (`Message`, `ChatSession`)

### Component Structure (Next.js App Router)
```typescript
"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export default function PageName() {
  const router = useRouter()
  const [state, setState] = useState<string>("")

  return (
    <div>
      <Component />
    </div>
  )
}
```

### TypeScript Types
- Use interfaces for object shapes
- Use type aliases for unions and primitives
- Always type function parameters and return values

```typescript
// Good
export interface ChatMessage {
  id: string
  role: "user" | "assistant"
  content: string
  timestamp: number
}

export type EditInfo = {
  id: string
  path: string
  type: "create" | "modify" | "delete"
  timestamp: Date
}
```

### Error Handling
- Use try/catch blocks for async operations
- Provide meaningful error messages
- Handle loading states in UI components
- Use console.error for logging errors

### State Management
- Use React hooks for local component state
- Use the Zustand-like store pattern in `lib/chat-store.tsx`
- Prefer `useState` with functional updates for complex state

### AI Integration Guidelines
- Use the `ai` package for AI interactions
- Use `@ai-sdk/react` for React integration with `useChat` hook
- Define tools using the `tool()` function with Zod schemas
- Handle streaming responses with async generators
- Tools available: `glob`, `read`, `write`, `bash`

## Project Structure

```
/app                    # Next.js App Router pages
  /api                  # API routes
    /chat               # Chat API (POST)
    /files              # File operations API
    /history            # Session history API
  /chat                 # Chat page
  /k/[key]              # Remote session page
  layout.tsx            # Root layout
  page.tsx              # Home page (project selector)
  globals.css           # Global styles

/components             # React components
  /ui                   # shadcn/ui components (Button, Card, Input, etc.)
  /ai-elements          # AI-related UI components
  file-tree.tsx         # File tree navigation
  file-viewer.tsx       # File content viewer
  edits-panel.tsx       # Edits tracking panel
  message.tsx           # Chat message component

/lib                    # Utility libraries
  catalog.ts            # JSON-Render catalog definition
  chat-store.tsx        # Chat session state management
  registry.ts           # Component registry
  tool.ts               # AI tool definitions (glob, read, write, bash)
  utils.ts              # General utilities

/public                 # Static assets
```

## API Routes

### `/api/chat` (POST)
- Handles AI chat requests
- Passes `path` (workspace path) in request body
- Returns streaming AI responses with tool executions

### `/api/files` (GET, POST)
- GET: List files in a directory
- POST: Read file content

### `/api/history` (GET)
- Fetches remote session history by session key

## JSON-Render Integration

This project uses `@json-render` for dynamic UI rendering. The catalog is defined in `lib/catalog.ts`:

```typescript
import { defineCatalog } from "@json-render/core"
import { schema } from "@json-render/react/schema"
import { shadcnComponentDefinitions } from "@json-render/shadcn/catalog"

export const catalog = defineCatalog(schema, {
  components: {
    Card: shadcnComponentDefinitions.Card,
    Stack: shadcnComponentDefinitions.Stack,
    Heading: shadcnComponentDefinitions.Heading,
    Button: shadcnComponentDefinitions.Button,
    Input: shadcnComponentDefinitions.Input,
  },
  actions: {},
})
```

Available components: Card, Stack, Heading, Button, Input

## Bun-Specific Guidelines

- Use `bun <file>` instead of `node <file>`
- Use `bun run <script>` instead of `npm run <script>`
- Use `bun install` for dependencies
- Bun automatically loads .env files

## Frontend Guidelines

### Tailwind CSS
- Use Tailwind CSS 4 syntax
- Follow shadcn/ui design patterns
- Use `bg-card`, `bg-background`, `text-muted-foreground` etc. for theming

### Component Library
- Use shadcn/ui components from `@/components/ui/`
- Available: Button, Card, Input, Switch
- Customize via `components.json` and Tailwind

### Animation
- Use `motion` (Framer Motion) for animations
- Use Tailwind `animate-` classes for simple animations

## Security Best Practices
- Validate all inputs
- Sanitize AI-generated content before display
- Never commit secrets or API keys
- Use environment variables for configuration

## Git Workflow
- Write clear, concise commit messages
- Test before committing
- Keep commits focused on single changes
