import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";

export default function ModeSelect({
  build,
  setBuild,
}: {
  build: boolean;
  setBuild: (value: boolean) => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className="w-12 h-8 border rounded-lg p-1 gap-0.5 flex items-center justify-center cursor-pointer"
          onClick={() => setBuild(!build)}>
          <button
            className={cn(
              "w-5 h-full border rounded-sm transition-colors ease-out font-mono flex items-center justify-center text-xs font-semibold cursor-pointer",
              build
                ? "bg-primary text-background"
                : "bg-transparent text-transparent",
            )}>
            B
          </button>
          <button
            className={cn(
              "w-5 h-full border rounded-sm transition-colors ease-out font-mono flex items-center justify-center text-xs font-semibold cursor-pointer",
              build
                ? "bg-transparent text-transparent"
                : "bg-primary text-background",
            )}>
            P
          </button>
        </div>
      </TooltipTrigger>
      <TooltipContent>
        <p>Switch to {build ? "build" : "plan"} mode!</p>
      </TooltipContent>
    </Tooltip>
  );
}
