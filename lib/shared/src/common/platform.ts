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

/** Reports whether the current OS is Linux. */
export function isLinux(): boolean {
    // For Node environments (such as VS Code Desktop).
    if (typeof process !== 'undefined') {
        if (process.platform) {
            return process.platform === 'linux'
        }
    }

    // For web environments (such as webviews and VS Code Web).
    if (typeof navigator === 'object') {
        return navigator.userAgent?.includes('Linux')
    }

    return false
}

/** Reports whether the current OS is Ubuntu version 18 or 20. */
export function isUbuntu(version: 18 | 20): boolean {
    // Only check in Node environments on Linux
    if (!isLinux()) {
        return false
    }

    // Try the most reliable method first: lsb_release
    try {
        const { execSync } = require('node:child_process')
        const output = execSync('lsb_release -r -s', { encoding: 'utf8' }).trim()
        return output.startsWith(`${version}.`)
    } catch {
        // lsb_release not available, continue to fallback
    }

    // Fallback: kernel version heuristic (less reliable but faster)
    try {
        const os = require('node:os')
        const release = os.release()
        const [, major, minor] = release.match(/^(\d+)\.(\d+)/) || []

        if (!major || !minor) return false

        const majorNum = Number(major)
        const minorNum = Number(minor)

        // Ubuntu 18.04: kernel 4.15.x - 5.3.x
        // Ubuntu 20.04: kernel 5.4.x+
        if (version === 18) {
            return (majorNum === 4 && minorNum >= 15) || (majorNum === 5 && minorNum < 4)
        }
        if (version === 20) {
            return (majorNum === 5 && minorNum >= 4) || majorNum > 5
        }
    } catch {
        // Kernel check failed
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
