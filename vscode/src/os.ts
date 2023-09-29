import os from 'os'

export function getOSArch(): {
    platform?: string
    arch?: string
} {
    const nodePlatformToPlatform: { [key: string]: string } = {
        darwin: 'macos',
        linux: 'linux',
        win32: 'windows',
    }
    const nodeMachineToArch: { [key: string]: string } = {
        arm64: 'aarch64',
        aarch64: 'aarch64',
        x86_64: 'x86_64',
        i386: 'x86',
        i686: 'x86',
    }

    let platform
    try {
        platform = nodePlatformToPlatform[os.platform()]
    } catch {
        // Ignore errors
    }

    let arch
    try {
        arch = nodeMachineToArch[os.arch()]
    } catch {
        // Ignore errors
    }

    return {
        platform,
        arch,
    }
}
