"use client"

import { useEffect, useRef, useState } from "react"
import { X } from "lucide-react"
import { Button } from "./button"

interface DialogProps {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
}

export function Dialog({ open, onClose, title, children }: DialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    if (open) {
      document.addEventListener("keydown", handleEscape)
      document.body.style.overflow = "hidden"
    }
    return () => {
      document.removeEventListener("keydown", handleEscape)
      document.body.style.overflow = ""
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        ref={dialogRef}
        className="relative z-10 w-full max-w-md rounded-xl border border-border/50 bg-card p-5 shadow-2xl animate-in fade-in zoom-in-95 duration-200"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold">{title}</h2>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={onClose}
            className="size-6"
          >
            <X className="size-3.5" />
          </Button>
        </div>
        {children}
      </div>
    </div>
  )
}

interface PromptDialogProps {
  open: boolean
  onClose: () => void
  onConfirm: (value: string) => void
  title: string
  placeholder?: string
  confirmLabel?: string
}

export function PromptDialog({
  open,
  onClose,
  onConfirm,
  title,
  placeholder = "",
  confirmLabel = "Create",
}: PromptDialogProps) {
  const [value, setValue] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (value.trim()) {
      onConfirm(value.trim())
      setValue("")
      onClose()
    }
  }

  const handleClose = () => {
    setValue("")
    onClose()
  }

  return (
    <Dialog open={open} onClose={handleClose} title={title}>
      <form onSubmit={handleSubmit}>
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded-md border border-border/50 bg-background px-3 py-2 text-sm outline-none focus:border-primary/50"
        />
        <div className="mt-4 flex justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            size="sm"
            disabled={!value.trim()}
          >
            {confirmLabel}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
