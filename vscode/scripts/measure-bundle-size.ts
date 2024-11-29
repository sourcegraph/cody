import { promises as fs } from 'fs'

// Define size limits in bytes
const SIZE_LIMITS = {
    extension: 15 * 1024 * 1024, // 15MB for example
    webview: 10 * 1024 * 1024,    // 10MB for example
    vsix: 18 * 1024 * 1024       // 25MB for example
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
    // Measure individual bundle sizes
    const extensionBundle = await fs.stat('./dist/extension.node.js')
    const webviewBundle = await fs.stat('./dist/extension.web.js')
    const vsixSize = await fs.stat('./dist/cody.vsix').catch(() => ({ size: 0 }))
    
    // Check size limits
    const violations: string[] = []
    
    if (extensionBundle.size > SIZE_LIMITS.extension) {
        violations.push(
            `Extension bundle size (${prettyPrintBytes(extensionBundle.size)}) exceeds limit of ${prettyPrintBytes(SIZE_LIMITS.extension)}`
        )
    }
    
    if (webviewBundle.size > SIZE_LIMITS.webview) {
        violations.push(
            `Webview bundle size (${prettyPrintBytes(webviewBundle.size)}) exceeds limit of ${prettyPrintBytes(SIZE_LIMITS.webview)}`
        )
    }
    
    if (vsixSize.size > SIZE_LIMITS.vsix) {
        violations.push(
            `VSIX size (${prettyPrintBytes(vsixSize.size)}) exceeds limit of ${prettyPrintBytes(SIZE_LIMITS.vsix)}`
        )
    }

    // Log current measurements
    console.log(`Extension bundle size: ${prettyPrintBytes(extensionBundle.size)}`)
    console.log(`Webview bundle size: ${prettyPrintBytes(webviewBundle.size)}`)
    console.log(`Packaged extension size: ${prettyPrintBytes(vsixSize.size)}`)

    // Exit with error if size limits are exceeded
    if (violations.length > 0) {
        console.error('\n❌ Bundle size violations:')
        violations.forEach(v => console.error(`- ${v}`))
        process.exit(1)
    }
}

measureBundleSize().catch(error => {
    console.error('Error measuring bundle size:', error)
    process.exit(1)
})