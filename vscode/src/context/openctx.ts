import type { OpenCtxExtensionAPI } from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'

/**
 * Get the OpenCtx API exposed by the OpenCtx VS Code extension, if installed.
 */
export async function getOpenCtxExtensionAPI(): Promise<OpenCtxExtensionAPI> {
    const API_VERSION = 1 as const

    if (openctxExtensionAPI) {
        return (await openctxExtensionAPI).apiVersion(API_VERSION)
    }

    const ext = vscode.extensions.getExtension<OpenCtxVSCodeExtensionAPI>('sourcegraph.openctx')
    if (!ext) {
        throw new Error('The OpenCtx VS Code extension is not installed.')
    }
    return (await ext.activate()).apiVersion(API_VERSION)
}

let openctxExtensionAPI: Promise<OpenCtxVSCodeExtensionAPI> | undefined

/**
 * Activate the OpenCtx VS Code extension from source, so that both the Cody and OpenCtx VS Code
 * extensions can be developed at the same time.
 */
export async function activateOpenCtxDevelopmentExtension(
    context: Pick<vscode.ExtensionContext, 'secrets' | 'subscriptions'>
): Promise<void> {
    if (openctxExtensionAPI) {
        throw new Error('The OpenCtx VS Code extension is already activated for extension development.')
    }

    openctxExtensionAPI = new Promise<OpenCtxVSCodeExtensionAPI>((resolve, reject) => {
        const extModule: Promise<{
            activate(
                context: Pick<vscode.ExtensionContext, 'secrets' | 'subscriptions'>,
                isOwnActivation: false
            ): OpenCtxVSCodeExtensionAPI
            // @ts-ignore
        }> = import('../../../../openctx/client/vscode/dist/extension.node.js')
        extModule
            .then(({ activate }) => {
                resolve(activate(context, false))
            })
            .catch(reject)
    })

    return openctxExtensionAPI.then(() => undefined)
}

interface OpenCtxVSCodeExtensionAPI {
    /**
     * If this API changes, the version number will be incremented.
     */
    apiVersion(version: 1): OpenCtxExtensionAPI
}
