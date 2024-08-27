import type { ClientCapabilities } from './protocol-alias'

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
    secrets: 'client-managed',
}
