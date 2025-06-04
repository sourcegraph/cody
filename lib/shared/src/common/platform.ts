/** Report whether the current OS is Windows. */
export function isWindows(): boolean {
    // For Node environments (such as VS Code Desktop).
    if (typeof process !== 'undefined') {
        if (process.platform) {
            return process.platform.startsWith('win')
        }
    }

    // For web environments (such as webviews and VS Code Web).
    if (typeof navigator === 'object') {
        return navigator.userAgent.toLowerCase().includes('windows')
    }

    return false
}

/** Reports whether the current OS is macOS. */
export function isMacOS(): boolean {
    // For Node environments (such as VS Code Desktop).
    if (typeof process !== 'undefined') {
        if (process.platform) {
            return process.platform === 'darwin'
        }
    }

    // For web environments (such as webviews and VS Code Web).
    if (typeof navigator === 'object') {
        return navigator.userAgent?.includes('Mac')
    }

    return false
}

export function getPlatform(): string {
    const platform = process.platform
    switch (platform) {
        case 'darwin':
            return 'macos'
        case 'linux':
            return 'linux'
        default:
            // fallback to the platform string
            return platform?.startsWith('win') ? 'windows' : platform
    }
}
