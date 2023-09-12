import { downloadAndUnzipVSCode } from '@vscode/test-electron'

export const vscodeVersion = '1.81.1'

export function installDeps(): Promise<string> {
    return downloadAndUnzipVSCode(vscodeVersion)
}

if (require.main === module) {
    const timeout = setTimeout(
        () => {
            console.error('timed out waiting to install dependencies')
            process.exit(1)
        },
        5 * 60 * 1000 // 5 minutes
    )
    void (async () => {
        await installDeps()
        clearTimeout(timeout)
    })()
}
