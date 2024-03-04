import type { Span } from '@opentelemetry/api'
import { featureFlagProvider } from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'
import { getConfiguration } from '../../configuration'
import type { ExtensionApi } from '../../extension-api'
import { getExtensionDetails } from '../telemetry'

// Ensure to ad exposed experiments at the very end to make sure we include experiments that the
// user is being exposed to while the span was generated
export function recordExposedExperimentsToSpan(span: Span): void {
    span.setAttributes(featureFlagProvider.getExposedExperiments())
    const extensionDetails = getExtensionDetails(getConfiguration(vscode.workspace.getConfiguration()))
    span.setAttributes(extensionDetails as any)

    const extensionApi: ExtensionApi | undefined =
        vscode.extensions.getExtension('sourcegraph.cody-ai')?.exports
    if (extensionApi && extensionDetails.ide === 'VSCode') {
        const vscodeChannel: 'release' | 'pre-release' | 'development' | 'test' | null =
            extensionApi.extensionMode === vscode.ExtensionMode.Development
                ? 'development'
                : extensionApi.extensionMode === vscode.ExtensionMode.Test
                  ? 'test'
                  : inferVSCodeChannelFromVersion(extensionDetails.version)
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
