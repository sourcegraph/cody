import { promises as fs } from 'node:fs'
import { appendFileSync } from 'node:fs'

const SIZE_LIMITS = {
    extension: 20 * 1024 * 1024, // 20MB
    webview: 15 * 1024 * 1024, // 15MB
}

function prettyPrintMB(bytes: number): string {
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB'
}

async function measureBundleSize(): Promise<void> {
    const extensionBundle = await fs.stat('./dist/extension.node.js')
    const webviewBundle = await fs.stat('./dist/extension.web.js')

    const violations: string[] = []

    if (extensionBundle.size > SIZE_LIMITS.extension) {
        violations.push(
            `Extension bundle size (${prettyPrintMB(
                extensionBundle.size
            )}) exceeds limit of ${prettyPrintMB(SIZE_LIMITS.extension)}`
        )
    }

    if (webviewBundle.size > SIZE_LIMITS.webview) {
        violations.push(
            `Webview bundle size (${prettyPrintMB(webviewBundle.size)}) exceeds limit of ${prettyPrintMB(
                SIZE_LIMITS.webview
            )}`
        )
    }
    // Write the bundle sizes to the GITHUB_ENV file
    if (process.env.GITHUB_ENV) {
        appendFileSync(
            process.env.GITHUB_ENV,
            `EXTENSION_BUNDLE_SIZE_MB=${(extensionBundle.size / (1024 * 1024)).toFixed(2)}\n`
        )
        appendFileSync(
            process.env.GITHUB_ENV,
            `WEBVIEW_BUNDLE_SIZE_MB=${(webviewBundle.size / (1024 * 1024)).toFixed(2)}\n`
        )
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
