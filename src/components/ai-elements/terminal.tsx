"use client"

import { createContext, useContext, useRef, useEffect, useState } from "react"
import { Copy, RotateCcw, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import Ansi from "ansi-to-react"

const TerminalContext = createContext<{ output: string }>({ output: "" })

interface TerminalProps {
  autoScroll?: boolean
  isStreaming?: boolean
  onClear?: () => void
  output: string
  children?: React.ReactNode
  className?: string
}

export function Terminal(props: TerminalProps) {
  const { output, children, className } = props

  return (
    <TerminalContext.Provider value={{ output }}>
      <div
        className={cn(
          "rounded-lg border bg-card text-card-foreground shadow-sm overflow-hidden",
          className
        )}
      >
        {children}
      </div>
    </TerminalContext.Provider>
  )
}

export function TerminalHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/30 rounded-t-lg">
      {children}
    </div>
  )
}

export function TerminalTitle({ children }: { children: React.ReactNode }) {
  return <div className="text-xs font-mono text-muted-foreground truncate">{children}</div>
}

export function TerminalActions({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center gap-1">{children}</div>
}

export function TerminalStatus() {
  return (
    <div className="flex items-center gap-1.5">
      <div className="size-2 rounded-full bg-emerald-500" />
      <span className="text-[10px] text-muted-foreground">Ready</span>
    </div>
  )
}

export function TerminalContent() {
  const { output } = useContext(TerminalContext)
  const scrollRef = useRef<HTMLPreElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [output])

  if (!output) return null

  return (
    <pre
      ref={scrollRef}
      className="px-3 py-2 text-xs font-mono leading-relaxed overflow-auto max-h-80 whitespace-pre-wrap break-all"
    >
      <Ansi>{output}</Ansi>
    </pre>
  )
}

export function TerminalClearButton({ onClick }: { onClick?: () => void }) {
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={onClick}
      className="size-6"
    >
      <RotateCcw className="size-3" />
    </Button>
  )
}

export function TerminalCopyButton({ onCopy }: { onCopy?: () => void }) {
  const { output } = useContext(TerminalContext)
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(output)
    } catch {
      // fallback: no-op
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    onCopy?.()
  }

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={handleCopy}
      className="size-6"
    >
      {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
    </Button>
  )
}
