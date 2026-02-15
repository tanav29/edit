import React from "react"
import { Box, Text } from "ink"
import type { ToolCallInfo } from '../../types.js'
import Spinner from "ink-spinner"

type ToolCallDisplayProps = {
  toolCall: ToolCallInfo
}

const TOOL_ICONS: Record<string, string> = {
  bash: '$',
  read: 'R',
  write: 'W',
  sed: 'E',
  grep: '?',
  glob: '*',
  ls: 'D',
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function formatArgs(name: string, args: Record<string, unknown>): string {
  switch (name) {
    case 'bash':
      return `$ ${args.command}`
    case 'read':
      return `${args.filePath}${args.offset ? ` [${args.offset}-${(args.offset as number) + ((args.limit as number) || 200)}]` : ''}`
    case 'write':
      return `${args.filePath}`
    case 'sed':
      return `${args.filePath}`
    case 'grep':
      return `/${args.pattern}/${args.include ? ` (${args.include})` : ''}`
    case 'glob':
      return `${args.pattern}`
    case 'ls':
      return `${args.path || '.'}`
    default:
      return JSON.stringify(args)
  }
}

function truncate(str: string, max: number): string {
  if (str.length <= max) return str
  return str.substring(0, max - 3) + '...'
}

function getResultPreview(toolCall: ToolCallInfo): string | null {
  if (!toolCall.result) return null

  const result = toolCall.result

  // For sed/write, extract just the first line (the "Edited..." or "Wrote..." part)
  if (toolCall.name === 'sed' || toolCall.name === 'write') {
    const firstLine = result.split('\n')[0]
    return firstLine || null
  }

  // For bash, show first meaningful line
  if (toolCall.name === 'bash') {
    const lines = result.split('\n').filter((l: string) => l.trim())
    if (lines.length === 0) return null
    if (lines.length === 1) return truncate(lines[0] ?? '', 80)
    return truncate(lines[0] ?? '', 70) + ` (+${lines.length - 1} lines)`
  }

  // For read, show line count
  if (toolCall.name === 'read') {
    const headerMatch = result.match(/Lines (\d+)-(\d+) of (\d+)/)
    if (headerMatch) return `Lines ${headerMatch[1]}-${headerMatch[2]} of ${headerMatch[3]}`
    return null
  }

  // For grep, show match count
  if (toolCall.name === 'grep') {
    const countMatch = result.match(/^(\d+) match/)
    if (countMatch) return `${countMatch[1]} matches`
    if (result === 'No matches found') return 'No matches'
    return null
  }

  // For glob/ls, show count
  if (toolCall.name === 'glob' || toolCall.name === 'ls') {
    const lines = result.split('\n').filter((l: string) => l.trim())
    return `${lines.length} entries`
  }

  return truncate(result.split('\n')[0] || '', 60)
}

export function ToolCallDisplay({ toolCall }: ToolCallDisplayProps) {
  const icon = TOOL_ICONS[toolCall.name] || '>'
  const argsStr = formatArgs(toolCall.name, toolCall.args)
  const preview = toolCall.status === 'completed' ? getResultPreview(toolCall) : null
  const durationStr = toolCall.duration ? ` ${formatDuration(toolCall.duration)}` : ''

  const statusColor = toolCall.status === 'executing' ? 'cyan'
    : toolCall.status === 'completed' ? 'green'
    : toolCall.status === 'error' ? 'red'
    : toolCall.status === 'rejected' ? 'yellow'
    : 'white'

  const statusIcon = toolCall.status === 'executing' ? null
    : toolCall.status === 'completed' ? '+'
    : toolCall.status === 'error' ? 'x'
    : toolCall.status === 'rejected' ? '-'
    : '?'

  return (
    <Box flexDirection="column">
      <Box>
        <Text color={statusColor}>
          {toolCall.status === 'executing' ? (
            <><Spinner type="dots" />{' '}</>
          ) : (
            <Text>{statusIcon} </Text>
          )}
        </Text>
        <Text color={statusColor} bold>{toolCall.name}</Text>
        <Text color="gray"> {truncate(argsStr, 60)}</Text>
        {durationStr && <Text color="gray" dimColor>{durationStr}</Text>}
      </Box>

      {toolCall.status === 'error' && toolCall.error && (
        <Box marginLeft={2}>
          <Text color="red" dimColor>  {truncate(toolCall.error, 80)}</Text>
        </Box>
      )}

      {preview && toolCall.status === 'completed' && (
        <Box marginLeft={2}>
          <Text color="gray" dimColor>  {preview}</Text>
        </Box>
      )}

      {/* Show diff for sed/write */}
      {toolCall.status === 'completed' && toolCall.result &&
       (toolCall.name === 'sed' || toolCall.name === 'write') &&
       toolCall.result.includes('@@') && (
        <Box flexDirection="column" marginLeft={2} marginTop={0}>
          {toolCall.result
            .split('\n')
            .filter((line: string) => line.startsWith('+') || line.startsWith('-') || line.startsWith('@@'))
            .slice(0, 20)
            .map((line: string, i: number) => (
              <Text
                key={i}
                color={line.startsWith('+') ? 'green' : line.startsWith('-') ? 'red' : 'cyan'}
                dimColor
              >
                {'  '}{line}
              </Text>
            ))}
        </Box>
      )}
    </Box>
  )
}

// Keep the old component for backward compatibility
export function ToolExecutionDisplay({ toolExecution }: { toolExecution: { name: string; status: string; message?: string } }) {
  return (
    <Box flexDirection="column">
      <Text color={
        toolExecution.status === 'executing' ? 'cyan' :
          toolExecution.status === 'completed' ? 'green' :
            toolExecution.status === 'error' ? 'red' : 'white'
      }>
        {toolExecution.status === 'executing' && <Text><Spinner type="dots" /></Text>}
        {toolExecution.status === 'completed' && <Text>+</Text>}
        {toolExecution.status === 'error' && <Text>x</Text>}
        {" " + toolExecution.name}
      </Text>
      {toolExecution.message && (
        <Text>  {toolExecution.message}</Text>
      )}
    </Box>
  )
}
