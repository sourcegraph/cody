/** Report whether the current OS is Windows. */
export function isWindows(): boolean {
    // For Node environments (such as VS Code Desktop).
    // eslint-disable-next-line @typescript-eslint/prefer-optional-chain
    if (typeof process !== 'undefined' && process.platform) {
        return process.platform.startsWith('win')
    }

    // For web environments (such as webviews and VS Code Web).
    if (typeof navigator === 'object') {
        return navigator.userAgent.toLowerCase().includes('windows')
    }

    return false // default
}
