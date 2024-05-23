import type { ClientCapabilities } from './agent-protocol'

export const allClientCapabilitiesEnabled: ClientCapabilities = {
    progressBars: 'enabled',
    edit: 'enabled',
    editWorkspace: 'enabled',
    untitledDocuments: 'enabled',
    showDocument: 'enabled',
    codeLenses: 'enabled',
    showWindowMessage: 'request',
    ignore: 'enabled',
    codeActions: 'enabled',
}
