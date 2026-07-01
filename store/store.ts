import { create } from "zustand";

type SideStore = {
    side: boolean;
    toggleSide: () => void;
};

const useSideStore = create<SideStore>((set) => ({
    side: false,
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

const useTerminalStore = create<{
    side: boolean;
    toggleSide: () => void;
}>((set) => ({
    side: false,
    toggleSide: () => set((state) => ({ side: !state.side })),
}));

export function useTerminal(): [boolean, () => void] {
    const side = useTerminalStore((s) => s.side);
    const toggleSide = useTerminalStore((s) => s.toggleSide);
    return [side, toggleSide];
}
