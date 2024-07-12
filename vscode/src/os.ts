import os from 'node:os'

export enum Platform {
    Linux = 'linux',
    Mac = 'macos',
    Windows = 'windows',
}

export enum Arch {
    Arm64 = 'arm64',
    Aarch64 = 'aarch64',
    X86_64 = 'x86_64',
    X64 = 'x64',
    X86 = 'x86',
}

export function getOSArch(): {
    platform?: Platform
    arch?: Arch
} {
    const nodePlatformToPlatform: { [key: string]: Platform } = {
        darwin: Platform.Mac,
        linux: Platform.Linux,
        win32: Platform.Windows,
    }
    const nodeMachineToArch: { [key: string]: Arch } = {
        arm64: Arch.Aarch64,
        aarch64: Arch.Aarch64,
        x86_64: Arch.X86_64,
        x64: Arch.X86_64,
        i386: Arch.X86,
        i686: Arch.X86,
    }

    let platform: Platform | undefined
    try {
        platform = nodePlatformToPlatform[os.platform()]
    } catch {
        // Ignore errors
    }

    let arch: Arch | undefined
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
