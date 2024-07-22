import type { Controller } from '@openctx/vscode-lib/dist/controller'

// TODO(dyma): Signature for Controller['annotation'] doesn't make sense for all Cody clients,
// e.g. Cody CLI cannot directly access VSCode's APIs. The {uri: Uri, getText(): string} interface
// should be a common abstraction.
type OpenCtxClient = Pick<Controller, 'meta' | 'mentions' | 'items' | 'annotations'>

class OpenCtx {
    constructor(public client: OpenCtxClient | undefined) {}
}

export const openCtx = new OpenCtx(undefined)

/**
 * Set the handle to the OpenCtx client.
 */
export function setOpenCtxClient(client: OpenCtxClient): void {
    openCtx.client = client
}

export const REMOTE_REPOSITORY_PROVIDER_URI = 'internal-remote-repository-search'
export const REMOTE_FILE_PROVIDER_URI = 'internal-remote-file-search'
export const WEB_PROVIDER_URI = 'internal-web-provider'
