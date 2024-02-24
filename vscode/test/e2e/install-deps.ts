import { spawn } from 'child_process'

import {
    ConsoleReporter,
    type ProgressReport,
    ProgressReportStage,
    downloadAndUnzipVSCode,
} from '@vscode/test-electron'

// The VS Code version to use for e2e tests (there is also a version in ../integration/main.ts used for integration tests).
//
// We set this to stable so that tests are always running on the version of VS Code users are likely to be using. This may
// result in tests breaking after a VS Code release but it's better for them to be investigated than potential bugs being
// missed because we're running on an older version than users.
const vscodeVersion = 'stable'

// A custom version of the VS Code download reporter that silences matching installation
// notifications as these otherwise are emitted on every test run
class CustomConsoleReporter extends ConsoleReporter {
    public report(report: ProgressReport): void {
        if (report.stage !== ProgressReportStage.FoundMatchingInstall) {
            super.report(report)
        }
    }
}

export function installVsCode(): Promise<string> {
    return downloadAndUnzipVSCode(
        vscodeVersion,
        undefined,
        new CustomConsoleReporter(process.stdout.isTTY)
    )
}

function installChromium(): Promise<void> {
    const proc = spawn('pnpm', ['exec', 'playwright', 'install', 'chromium'], {
        shell: true,
    })
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
