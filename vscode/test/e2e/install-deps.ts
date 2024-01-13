import { spawn } from 'child_process'

import {
    ConsoleReporter,
    downloadAndUnzipVSCode,
    ProgressReportStage,
    type ProgressReport,
} from '@vscode/test-electron'

const vscodeVersion = '1.81.1'

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

function installChromium(): Promise<void> {
    const proc = spawn('pnpm', ['exec', 'playwright', 'install', 'chromium'], { shell: true })
    return new Promise<void>((resolve, reject) => {
        proc.on('error', e => console.error(e))
        proc.stderr.on('data', e => {
            const message = e.toString()
            if (message) {
                console.error(message)
            }
        })
        proc.stdout.on('data', e => {
            const message = e.toString()
            if (message) {
                console.log(message)
            }
        })
        proc.on('close', code => {
            if (code) {
                reject(new Error(`Process failed: ${code}}`))
            } else {
                resolve()
            }
        })
    })
}

function installAllDeps(): Promise<unknown> {
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
