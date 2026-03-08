import { Streamdown } from "streamdown"
import { code } from "@streamdown/code"
import { mermaid } from "@streamdown/mermaid"
import { math } from "@streamdown/math"
import { cjk } from "@streamdown/cjk"

interface MarkdownRendererProps {
  text: string
  isStreaming: boolean
}

export default function MarkdownRenderer({ text, isStreaming }: MarkdownRendererProps) {
  return (
    <Streamdown
      className="chat-markdown"
      mode="static"
      plugins={{ code, mermaid, math, cjk }}
      shikiTheme={["github-light", "github-dark"]}
      mermaid={{ config: { theme: "dark" } }}
      isAnimating={isStreaming}
    >
      {text}
    </Streamdown>
  )
}
