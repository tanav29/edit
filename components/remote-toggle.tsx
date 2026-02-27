"use client"

import { QRCodeSVG } from "qrcode.react"
import { Monitor, Smartphone, Copy, Check, Globe, RefreshCw } from "lucide-react"
import React, { useState, useEffect, useMemo } from "react"
import { Switch } from "@/components/ui/switch"
import { useChatStore } from "@/lib/chat-store"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export function RemoteToggle({ onSync, isSyncing }: { onSync?: () => void, isSyncing?: boolean }) {
  const { currentSession, toggleRemoteMode } = useChatStore()
  const [copied, setCopied] = useState(false)
  const [host, setHost] = useState("")

  useEffect(() => {
    if (typeof window !== "undefined") {
      setHost(window.location.host)
    }
  }, [])

  if (!currentSession) return null

  const remoteUrl = useMemo(() => `http://${host}/k/${currentSession.sessionKey}`, [host, currentSession.sessionKey]);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(remoteUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const qrCode = useMemo(() => (
    <div className="flex justify-center p-2 bg-white rounded-lg border border-border">
      <QRCodeSVG value={remoteUrl} size={100} />
    </div>
  ), [remoteUrl]);

  return (
    <div className="space-y-4 will-change-transform">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Globe className="size-3.5 text-muted-foreground" />
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Remote Access
          </span>
        </div>
        {currentSession.isRemoteEnabled && onSync && (
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={onSync}
            disabled={isSyncing}
            className="size-7 hover:bg-primary/10 hover:text-primary transition-colors"
            title="Sync Chat"
          >
            <RefreshCw className={cn("size-3.5", isSyncing && "animate-spin")} />
          </Button>
        )}
      </div>

      <div className="flex items-center justify-between p-2 rounded-lg bg-accent/30 border border-border/50">
        <div className="space-y-0.5">
          <div className="text-[11px] font-medium flex items-center gap-1.5">
            <Smartphone className="size-3" />
            Remote Mode
          </div>
          <div className="text-[10px] text-muted-foreground">
            Allow mobile control
          </div>
        </div>
        <Switch
          checked={!!currentSession.isRemoteEnabled}
          onCheckedChange={toggleRemoteMode}
        />
      </div>

      {currentSession.isRemoteEnabled && (
        <div className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-300 fill-mode-forwards">
          {qrCode}
          
          <div className="space-y-1.5">
            <div className="text-[10px] text-muted-foreground text-center">
              Scan to open on mobile
            </div>
            <div className="flex items-center gap-1.5 p-1.5 rounded bg-background border border-border/50">
              <code className="text-[10px] flex-1 truncate text-muted-foreground">
                {remoteUrl}
              </code>
              <Button
                variant="ghost"
                size="icon"
                className="size-6 shrink-0"
                onClick={copyToClipboard}
              >
                {copied ? (
                  <Check className="size-3 text-emerald-500" />
                ) : (
                  <Copy className="size-3" />
                )}
              </Button>
            </div>
          </div>

          <div className="flex items-center gap-2 p-2 rounded-lg bg-primary/5 border border-primary/10">
            <RefreshCw className="size-3 text-primary shrink-0" />
            <div className="text-[10px] text-primary/80 leading-tight">
              Sync manually to see updates from your phone.
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
