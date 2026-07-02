import { create } from "zustand";

type SideStore = {
  side: boolean;
  toggleSide: () => void;
};

const useSideStore = create<SideStore>((set) => ({
  side: true,
  toggleSide: () => set((state) => ({ side: !state.side })),
}));

export function useSide(): [boolean, () => void] {
  const side = useSideStore((s) => s.side);
  const toggleSide = useSideStore((s) => s.toggleSide);
  return [side, toggleSide];
}

const useRightSideStore = create<SideStore>((set) => ({
  side: false,
  toggleSide: () => set((state) => ({ side: !state.side })),
}));

export function useRightSide(): [boolean, () => void] {
  const side = useRightSideStore((s) => s.side);
  const toggleSide = useRightSideStore((s) => s.toggleSide);
  return [side, toggleSide];
}

export type TerminalTab = {
  id: string;
  label: string;
};

export type TerminalStore = {
  visible: boolean;
  terminals: TerminalTab[];
  activeTerminalId: string | null;
  addTerminal: () => string;
  removeTerminal: (id: string) => void;
  setActiveTerminal: (id: string) => void;
  toggleTerminal: () => void;
};

let terminalCounter = 0;

export const useTerminalStore = create<TerminalStore>((set) => ({
  visible: false,
  terminals: [{ id: "term-0", label: "Terminal" }],
  activeTerminalId: "term-0",
  addTerminal: () => {
    terminalCounter++;
    const id = `term-${terminalCounter}`;
    set((state) => ({
      terminals: [
        ...state.terminals,
        { id, label: `Terminal ${terminalCounter + 1}` },
      ],
      activeTerminalId: id,
      visible: true,
    }));
    return id;
  },
  removeTerminal: (id: string) => {
    set((state) => {
      const filtered = state.terminals.filter((t) => t.id !== id);
      if (filtered.length === 0) {
        return {
          terminals: filtered,
          activeTerminalId: null,
          visible: false,
        };
      }
      const isRemovingActive = state.activeTerminalId === id;
      const newActive = isRemovingActive
        ? filtered[filtered.length - 1].id
        : state.activeTerminalId;
      return {
        terminals: filtered,
        activeTerminalId: newActive,
        visible: filtered.length > 0 ? state.visible : false,
      };
    });
  },
  setActiveTerminal: (id: string) => {
    set({ activeTerminalId: id });
  },
  toggleTerminal: () => {
    set((state) => ({ visible: !state.visible }));
  },
}));

export function useTerminal(): [boolean, () => void] {
  const visible = useTerminalStore((s) => s.visible);
  const toggleTerminal = useTerminalStore((s) => s.toggleTerminal);
  return [visible, toggleTerminal];
}
