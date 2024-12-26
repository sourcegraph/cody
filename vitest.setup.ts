import { execSync } from 'node:child_process'
import path from 'node:path'

function buildAgentForTests() {
    execSync('pnpm run build:for-tests', {
        cwd: path.join(__dirname, 'agent'),
        stdio: 'inherit',
    })
}

export default function setup() {
    // buildAgentForTests()
}
