import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getProjectName(sessionPath: string) {
  const parts = sessionPath.split("/").filter(Boolean);
  return parts[parts.length - 1] || sessionPath;
}
