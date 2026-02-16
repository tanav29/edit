import { number } from "zod"

const file = Bun.file("/home/thetanav/TODO.md")

console.log(file)
const content = await file.text()
const allLines = content.split('\n')
const startLine = 1
const endLine = Math.min(allLines.length, startLine + 5 - 1)
const selectedLines = allLines.slice(startLine - 1, endLine)
const numbered = selectedLines.map((line, i) => `${startLine + i}: ${line}`)
console.log(`Lines ${startLine}-${endLine} of ${allLines.length}\n${numbered.join('\n')}`)