import { exec } from "node:child_process"
import { promisify } from "node:util"

const execAsync = promisify(exec)

const { stdout, stderr } = await execAsync("cd .. && ls", {
  timeout: 2000,
  maxBuffer: 1024 * 1024 * 5,
  cwd: "/home/thetanav/Code/project",
})
const out = stdout.trim()
const err = stderr.trim()
let result = out || '(no output)'
if (err) result += `\nstderr: ${err}`
console.log(result)