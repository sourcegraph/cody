import { execSync } from 'node:child_process'

// We use this wrapper script because there's no portable way to mention $PWD that works on macOS,
// Linux *and* Windows in Powershell *and* cmd.
const cwd: string = process.cwd()
if (process.argv.length < 3) {
    console.error(
        'Usage: ts-node scripts/run-with-extension-development-path.ts code|code-insiders|vscode-test-web arg...'
    )
    process.exit(1)
}
const executable: string = process.argv[2]
const command: string = `${executable} --extensionDevelopmentPath="${cwd}" ${process.argv
    .slice(3)
    .join(' ')}`

console.log(`Executing: ${command}`)
execSync(command, { stdio: 'inherit', env: { ...process.env, NODE_ENV: 'development' } })
