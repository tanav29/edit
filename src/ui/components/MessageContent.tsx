import { useState, useEffect } from "react"
import { Box, Text } from "ink"

type MessageContentProps = {
  content: string
  role: "user" | "assistant"
}

export function MessageContent({ content, role }: MessageContentProps) {
  const [Markdown, setMarkdown] = useState<any>(null)

  useEffect(() => {
    import("ink-markdown").then((mod) => {
      setMarkdown(() => mod.default)
    })
  }, [])

  // Don't render empty messages or tool result injections
  if (!content || content.startsWith('[TOOL_RESULT]') || content.startsWith('[TOOL_ERROR]')) {
    return null
  }

  // Don't render tool request placeholders
  if (content.startsWith('Tool request:') || content.startsWith('[REJECTED:')) {
    return null
  }

  if (role === "user") {
    return (
      <Box marginBottom={0}>
        <Text color="blue" bold>{"> "}</Text>
        <Text>{content}</Text>
      </Box>
    )
  }

  if (!Markdown) {
    return (
      <Box marginBottom={1}>
        <Text>{content}</Text>
      </Box>
    )
  }

  return (
    <Box marginBottom={1}>
      <Markdown>{content}</Markdown>
    </Box>
  )
}
