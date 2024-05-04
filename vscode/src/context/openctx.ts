import { type OpenCtxExtensionAPI, setOpenCtxExtensionAPI } from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'

export function exposeOpenCtxExtensionAPIHandle(): void {
    setOpenCtxExtensionAPI(async (): Promise<OpenCtxExtensionAPI | null> => {
        const API_VERSION = 1 as const

        const ext = vscode.extensions.getExtension<OpenCtxVSCodeExtensionAPI>('sourcegraph.openctx')
        if (!ext) {
            return null
        }
        return (await ext.activate()).apiVersion(API_VERSION)
    })
}

interface OpenCtxVSCodeExtensionAPI {
    /**
     * If this API changes, the version number will be incremented.
     */
    apiVersion(version: 1): OpenCtxExtensionAPI
}
