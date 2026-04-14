"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  Activity,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  BarChart,
  Bell,
  Bomb,
  Bot,
  Box,
  Building,
  Calendar,
  Calculator,
  Check,
  Circle,
  Clock,
  Cloud,
  Code,
  Download,
  Eye,
  File,
  FileText,
  Filter,
  Flag,
  Flame,
  Folder,
  FolderOpen,
  Fullscreen,
  Gauge,
  Grid,
  Hammer,
  Heart,
  Home,
  Laptop,
  Layout,
  Layers,
  Link,
  Mail,
  Maximize,
  MessageCircle,
  MessageSquare,
  Monitor,
  Moon,
  Plus,
  Play,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Server,
  Settings,
  Smartphone,
  Smile,
  Speaker,
  Sparkles,
  Square,
  Star,
  Sun,
  Target,
  Terminal,
  Timer,
  Trash2,
  TrendingUp,
  Triangle,
  User,
  Volume,
  Zap,
} from "lucide-react";

const ICON_OPTIONS = [
  { name: "Play", icon: Play },
  { name: "Download", icon: Download },
  { name: "Hammer", icon: Hammer },
  { name: "Terminal", icon: Terminal },
  { name: "Box", icon: Box },
  { name: "Code", icon: Code },
  { name: "Layers", icon: Layers },
  { name: "Server", icon: Server },
  { name: "Zap", icon: Zap },
  { name: "Flag", icon: Flag },
  { name: "Star", icon: Star },
  { name: "Heart", icon: Heart },
  { name: "Sparkles", icon: Sparkles },
  { name: "Eye", icon: Eye },
  { name: "Settings", icon: Settings },
  { name: "Search", icon: Search },
  { name: "Filter", icon: Filter },
  { name: "RefreshCw", icon: RefreshCw },
  { name: "Save", icon: Save },
  { name: "Folder", icon: Folder },
  { name: "FolderOpen", icon: FolderOpen },
  { name: "File", icon: File },
  { name: "FileText", icon: FileText },
  { name: "Calculator", icon: Calculator },
  { name: "Activity", icon: Activity },
  { name: "BarChart", icon: BarChart },
  { name: "TrendingUp", icon: TrendingUp },
  { name: "Gauge", icon: Gauge },
  { name: "Target", icon: Target },
  { name: "Monitor", icon: Monitor },
  { name: "Laptop", icon: Laptop },
  { name: "Smartphone", icon: Smartphone },
  { name: "Speaker", icon: Speaker },
  { name: "Volume", icon: Volume },
  { name: "Bell", icon: Bell },
  { name: "MessageCircle", icon: MessageCircle },
  { name: "Chat", icon: MessageSquare },
  { name: "Grid", icon: Grid },
  { name: "Layout", icon: Layout },
  { name: "Maximize", icon: Maximize },
  { name: "Fullscreen", icon: Fullscreen },
  { name: "ArrowUp", icon: ArrowUp },
  { name: "ArrowDown", icon: ArrowDown },
  { name: "ArrowLeft", icon: ArrowLeft },
  { name: "ArrowRight", icon: ArrowRight },
  { name: "Circle", icon: Circle },
  { name: "Check", icon: Check },
  { name: "Square", icon: Square },
  { name: "Triangle", icon: Triangle },
  { name: "Sun", icon: Sun },
  { name: "Moon", icon: Moon },
  { name: "Cloud", icon: Cloud },
  { name: "Flame", icon: Flame },
  { name: "Bomb", icon: Bomb },
  { name: "Bug", icon: Activity },
  { name: "Robot", icon: Bot },
  { name: "Smile", icon: Smile },
  { name: "User", icon: User },
  { name: "Home", icon: Home },
  { name: "Building", icon: Building },
  { name: "Calendar", icon: Calendar },
  { name: "Clock", icon: Clock },
  { name: "Timer", icon: Timer },
  { name: "Link", icon: Link },
  { name: "Mail", icon: Mail },
];

type IconOption = typeof ICON_OPTIONS[number];

export function getIconComponent(iconName: string): IconOption["icon"] | null {
  const found = ICON_OPTIONS.find((opt) => opt.name === iconName);
  return found ? found.icon : Play;
}

export { ICON_OPTIONS };

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CustomCommand, generateId } from "@/lib/custom-commands";

type CommandDialogProps = {
  command?: CustomCommand;
  onSave: (command: CustomCommand) => void;
  children: React.ReactNode;
};

export function CommandDialog({
  command,
  onSave,
  children,
}: CommandDialogProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(command?.name ?? "");
  const [cmd, setCmd] = useState(command?.command ?? "");
  const [selectedIcon, setSelectedIcon] = useState(command?.icon ?? "Play");

  const isEditing = !!command;
  const isValid = name.trim() && cmd.trim();

  function handleSave() {
    if (!isValid) return;

    onSave({
      id: command?.id ?? generateId(),
      name: name.trim(),
      command: cmd.trim(),
      icon: selectedIcon,
    });
    setOpen(false);
    setName("");
    setCmd("");
    setSelectedIcon("Play");
  }

  function handleOpenChange(open: boolean) {
    if (!open) {
      setName(command?.name ?? "");
      setCmd(command?.command ?? "");
      setSelectedIcon(command?.icon ?? "Play");
    }
    setOpen(open);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Edit Command" : "Add Command"}
          </DialogTitle>
          <DialogDescription>
            Create a custom button that runs a command in the terminal.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Name</label>
            <Input
              placeholder="e.g., dev"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Command</label>
            <Input
              placeholder="e.g., bun dev"
              value={cmd}
              onChange={(e) => setCmd(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Icon</label>
            <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto p-2 border rounded-md">
              {ICON_OPTIONS.map((opt) => {
                const Icon = opt.icon;
                const isSelected = selectedIcon === opt.name;
                return (
                  <button
                    key={opt.name}
                    type="button"
                    onClick={() => setSelectedIcon(opt.name)}
                    className={`p-2 rounded-md transition-colors ${
                      isSelected
                        ? "bg-primary text-primary-foreground"
                        : "hover:bg-muted"
                    }`}
                    title={opt.name}
                  >
                    <Icon className="size-4" />
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!isValid}>
            {isEditing ? "Save Changes" : "Add Command"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type ManageCommandsDialogProps = {
  commands: CustomCommand[];
  onAdd: (command: CustomCommand) => void;
  onUpdate: (id: string, command: Partial<CustomCommand>) => void;
  onDelete: (id: string) => void;
  onReset: () => void;
  children: React.ReactNode;
};

export function ManageCommandsDialog({
  commands,
  onAdd,
  onUpdate,
  onDelete,
  onReset,
  children,
}: ManageCommandsDialogProps) {
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const handleReset = () => {
    onReset();
    toast.success("Commands reset to defaults");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {/*
        Radix `DialogTrigger` requires its child to accept a forwarded `ref`.
        Wrapping in a plain element keeps the trigger reliable even when callers
        pass composite components (e.g. Tooltip).
      */}
      <DialogTrigger asChild>
        <span className="contents">{children}</span>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Manage Commands</DialogTitle>
          <DialogDescription>
            Add, edit, or remove custom commands that appear in the header.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {commands.length === 0 ? (
            <p className="text-center text-muted-foreground py-4">
              No commands yet. Add one to get started.
            </p>
          ) : (
            <div className="space-y-2">
              {commands.map((cmd) => {
                const Icon = getIconComponent(cmd.icon);
                const isEditingThis = editingId === cmd.id;

                return (
                  <div
                    key={cmd.id}
                    className="flex items-center gap-2 p-2 border rounded-md"
                  >
                    {Icon && <Icon className="size-4 shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">
                        {cmd.name}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {cmd.command}
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <CommandDialog
                        command={cmd}
                        onSave={(updated) => {
                          onUpdate(cmd.id, updated);
                          setEditingId(null);
                        }}
                      >
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                          <Settings className="size-3" />
                        </Button>
                      </CommandDialog>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 text-destructive"
                        onClick={() => onDelete(cmd.id)}
                      >
                        <Trash2 className="size-3" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <CommandDialog command={undefined} onSave={onAdd}>
            <Button variant="outline" className="w-full">
              <Plus className="size-4 mr-2" />
              Add Command
            </Button>
          </CommandDialog>
        </div>

        <DialogFooter className="sm:justify-between">
          <Button variant="ghost" onClick={handleReset}>
            <RotateCcw className="size-4 mr-2" />
            Reset to Defaults
          </Button>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
