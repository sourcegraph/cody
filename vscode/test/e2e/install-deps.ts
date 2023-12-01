import { spawn } from 'child_process'

import { ConsoleReporter, downloadAndUnzipVSCode, ProgressReport, ProgressReportStage } from '@vscode/test-electron'

export const vscodeVersion = '1.81.1'

// A custom version of the VS Code download reporter that silences matching installation
// notifications as these otherwise are emitted on every test run
class CustomConsoleReporter extends ConsoleReporter {
    public report(report: ProgressReport): void {
        if (report.stage !== ProgressReportStage.FoundMatchingInstall) {
            return super.report(report)
        }
    }
}

export function installVsCode(): Promise<string> {
    return downloadAndUnzipVSCode(vscodeVersion, undefined, new CustomConsoleReporter(process.stdout.isTTY))
}

export function installChromium(): Promise<void> {
    const proc = spawn('pnpm', ['exec', 'playwright', 'install', 'chromium'], { shell: true })
    return new Promise<void>((resolve, reject) => {
        proc.on('error', e => console.error(e))
        proc.stderr.on('data', e => console.error(e.toString()))
        proc.stdout.on('data', e => console.log(e.toString()))
        proc.on('close', code => {
            if (code) {
                reject(new Error(`Process failed: ${code}}`))
            } else {
                resolve()
            }
        })
    })
}

export function installAllDeps(): Promise<unknown> {
    return Promise.all([installVsCode(), installChromium()])
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
        await installAllDeps()
        clearTimeout(timeout)
    })()
}
