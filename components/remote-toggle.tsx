"use client"

import { Globe, Smartphone } from "lucide-react"
import React from "react"

export function RemoteToggle(props: { onSync?: () => void, isSyncing?: boolean }) {
  void props

  return (
    <div className="space-y-4 will-change-transform">
      <div className="flex items-center gap-2">
        <Globe className="size-3.5 text-muted-foreground" />
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Remote Access
        </span>
      </div>

      <div className="p-3 rounded-lg border border-dashed border-border/50 space-y-2">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Smartphone className="size-4" />
          <span className="text-xs font-medium">Not available in desktop mode</span>
        </div>
        <p className="text-[10px] text-muted-foreground/70 leading-relaxed">
          Remote access requires a web server and is not supported in the Tauri desktop application. 
          This feature may be re-introduced in a future update.
        </p>
      </div>
    </div>
  )
}
