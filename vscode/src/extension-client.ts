import type { TextDocument, Uri } from 'vscode'
import type vscode from 'vscode'
import type { ClientCapabilities } from './jsonrpc/agent-protocol'
import { FixupCodeLenses } from './non-stop/codelenses/provider'
import type { FixupActor, FixupFileCollection } from './non-stop/roles'
import type { FixupControlApplicator } from './non-stop/strategies'
import { version } from './version'

/**
 * Lets the extension delegate to the client (VSCode, Agent, etc.) to control
 * which components are used depending on the client's capabilities.
 */
export interface ExtensionClient {
    /**
     * Create the component which decorates FixupTasks with controls.
     * @param fixups the live collection of fixups; methods to manipulate them.
     */
    createFixupControlApplicator(fixups: FixupActor & FixupFileCollection): FixupControlApplicator

    /**
     * Opens a new document, creating appropriate file is required by a protocol.
     * This method allows client to change the URI, so the caller should inspect returned TextDocument.
     */
    openNewDocument(workspace: typeof vscode.workspace, uri: Uri): Thenable<TextDocument | undefined>

    get clientName(): string
    get clientVersion(): string
    get capabilities(): ClientCapabilities | undefined

    // Override this to customize the "client-name" that is sent in HTTP requests to /.api/completions/stream
    // For historical reasons, older SG instances reject requests from unknown client names.
    // See https://github.com/sourcegraph/sourcegraph-public-snapshot/pull/63855 for more details.
    httpClientNameForLegacyReasons?: string
}

/**
 * Gets the ExtensionClient implementation for VSCode.
 */
export function defaultVSCodeExtensionClient(): ExtensionClient {
    return {
        createFixupControlApplicator: files => new FixupCodeLenses(files),
        openNewDocument: (workspace, uri) => workspace.openTextDocument(uri),
        clientName: 'vscode',
        clientVersion: version,
        capabilities: undefined,
    }
}
