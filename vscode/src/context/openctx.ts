import type { OpenCtxExtensionAPI } from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'

/**
 * Get the OpenCtx API exposed by the OpenCtx VS Code extension, if installed.
 */
export async function getOpenCtxExtensionAPI(): Promise<OpenCtxExtensionAPI> {
    const API_VERSION = 1 as const

    const ext = vscode.extensions.getExtension<OpenCtxVSCodeExtensionAPI>('sourcegraph.openctx')
    if (!ext) {
        throw new Error('The OpenCtx VS Code extension is not installed.')
    }
    return (await ext.activate()).apiVersion(API_VERSION)
}

interface OpenCtxVSCodeExtensionAPI {
    /**
     * If this API changes, the version number will be incremented.
     */
    apiVersion(version: 1): OpenCtxExtensionAPI
}
