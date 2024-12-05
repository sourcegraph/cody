import { promises as fs } from 'node:fs'
import { appendFileSync } from 'node:fs'

const SIZE_LIMITS = {
    extension: 15 * 1024 * 1024, // 15MB
    webview: 10 * 1024 * 1024, // 10MB
}

function prettyPrintBytes(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB', 'TB']
    let unitIndex = 0

    while (bytes >= 1024 && unitIndex < units.length - 1) {
        bytes /= 1024
        unitIndex++
    }

    return `${bytes.toFixed(2)} ${units[unitIndex]}`
}

async function measureBundleSize(): Promise<void> {
    const extensionBundle = await fs.stat('./dist/extension.node.js')
    const webviewBundle = await fs.stat('./dist/extension.web.js')

    const violations: string[] = []

    if (extensionBundle.size > SIZE_LIMITS.extension) {
        violations.push(
            `Extension bundle size (${prettyPrintBytes(
                extensionBundle.size
            )}) exceeds limit of ${prettyPrintBytes(SIZE_LIMITS.extension)}`
        )
    }

    if (webviewBundle.size > SIZE_LIMITS.webview) {
        violations.push(
            `Webview bundle size (${prettyPrintBytes(
                webviewBundle.size
            )}) exceeds limit of ${prettyPrintBytes(SIZE_LIMITS.webview)}`
        )
    }
    // Write the bundle sizes to the GITHUB_ENV file
    if (process.env.GITHUB_ENV) {
        appendFileSync(process.env.GITHUB_ENV, `EXTENSION_BUNDLE_SIZE=${extensionBundle.size}\n`)
        appendFileSync(process.env.GITHUB_ENV, `WEBVIEW_BUNDLE_SIZE=${webviewBundle.size}\n`)
    } else {
        console.error('GITHUB_ENV environment variable is not defined.')
    }

    // For local debugging, log the current measurements
    if (process.env.LOG_BUNDLE_SIZE === 'true') {
        console.log(`Extension bundle size: ${prettyPrintBytes(extensionBundle.size)}`)
        console.log(`Webview bundle size: ${prettyPrintBytes(webviewBundle.size)}`)
    }

    if (violations.length > 0) {
        console.error('\n❌ Bundle size violations:')
        for (const v of violations) {
            console.error(`- ${v}`)
        }
        process.exit(1)
    }
}

measureBundleSize().catch(error => {
    console.error('Error measuring bundle size:', error)
    process.exit(1)
})
