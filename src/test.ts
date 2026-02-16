import { exec } from "node:child_process"
import { promisify } from "node:util"

const execAsync = promisify(exec)

const cwd = "/home/thetanav/Code/minis"
async function main() {

}

console.log(await main())