import { useNavigate, useSearch } from "@tanstack/react-router";

export function useSessionParam() {
  const search = useSearch({ from: "/" }) as { s?: string };
  const navigate = useNavigate({ from: "/" });

  const setSession = (nextValue: string | null) =>
    navigate({
      search: (prev) => ({
        ...prev,
        s: nextValue ?? undefined,
      }),
    });

  return [search.s ?? null, setSession] as const;
}
