import type { Span } from '@opentelemetry/api'
import {
    type CodyIDE,
    clientCapabilities,
    currentAuthStatus,
    featureFlagProvider,
} from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'
import type { ExtensionApi } from '../../extension-api'
import { getOSArch } from '../../os'
import { version } from '../../version'

const { platform, arch } = getOSArch()

// Ensure to ad exposed experiments at the very end to make sure we include experiments that the
// user is being exposed to while the span was generated
export function recordExposedExperimentsToSpan(span: Span): void {
    span.setAttributes(featureFlagProvider.getExposedExperiments(currentAuthStatus().endpoint))

    // This object is the old ExtensionDetails type, maintained for backcompat.
    interface ExtensionDetailsBackcompat {
        ide: CodyIDE
        arch?: string
        platform: string
        version: string
    }
    const cap = clientCapabilities()
    span.setAttributes({
        ide: cap.agentIDE,
        arch,
        platform: platform ?? 'browser',
        version: cap.agentExtensionVersion || 'unknown',
    } satisfies ExtensionDetailsBackcompat)

    const extensionApi: ExtensionApi | undefined =
        vscode.extensions.getExtension('sourcegraph.cody-ai')?.exports
    if (extensionApi && cap.isVSCode) {
        const vscodeChannel: 'release' | 'pre-release' | 'development' | 'test' | null =
            extensionApi.extensionMode === vscode.ExtensionMode.Development
                ? 'development'
                : extensionApi.extensionMode === vscode.ExtensionMode.Test
                  ? 'test'
                  : inferVSCodeChannelFromVersion(cap.agentExtensionVersion ?? version)
        span.setAttribute('vscodeChannel', vscodeChannel)
    }
}

function inferVSCodeChannelFromVersion(version: string): 'pre-release' | 'release' {
    const [, , patch] = version.split('.').map(Number)
    if (patch > 1000) {
        return 'pre-release'
    }
    return 'release'
}
