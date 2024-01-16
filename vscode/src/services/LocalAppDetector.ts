import * as vscode from 'vscode'

import { version } from '../../package.json'
import { type LocalEnv } from '../chat/protocol'

// The  OS and Arch support for Cody app

// Utility functions

const envInit: LocalEnv = {
    arch: process.arch,
    os: process.platform,
    homeDir: process.env.HOME,

    extensionVersion: version,

    uiKindIsWeb: vscode.env.uiKind === vscode.UIKind.Web,
}

export function getProcessInfo(): LocalEnv {
    return { ...envInit }
}
