"use client"

import { useEffect, useState } from "react"
import { Copy, RotateCcw, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface TerminalProps {
  autoScroll?: boolean
  isStreaming?: boolean
  onClear?: () => void
  output: string
  children?: React.ReactNode
  className?: string
}

export function Terminal({
  autoScroll = true,
  isStreaming = false,
  onClear,
  output,
  children,
  className,
}: TerminalProps) {
  return (
    <div
      className={cn(
        "rounded-lg border bg-card text-card-foreground shadow-sm",
        className
      )}
    >
      {children}
    </div>
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
  return <div className="text-xs font-mono text-muted-foreground">{children}</div>
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
  return null
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
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
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
