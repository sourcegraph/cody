import type { Disposable, TextDocument, Uri } from 'vscode'
import type vscode from 'vscode'
import type { EnterpriseContextFactory } from './context/enterprise-context-factory'
import type { ClientCapabilities } from './jsonrpc/agent-protocol'
import { FixupCodeLenses } from './non-stop/codelenses/provider'
import type { FixupActor, FixupFileCollection } from './non-stop/roles'
import type { FixupControlApplicator } from './non-stop/strategies'
import { version } from './version'

/**
 * Extension objects that are provided to the client to interact with directly.
 */
export type ExtensionObjects = {
    enterpriseContextFactory: EnterpriseContextFactory
}

/**
 * Lets the extension delegate to the client (VSCode, Agent, etc.) to control
 * which components are used depending on the client's capabilities.
 */
export interface ExtensionClient {
    /**
     * Provides extension objects to the client. This is called once during
     * registration. The returned Promise blocks registration completion.
     * @param goodies extension objects exposed to the client.
     */
    provide(goodies: ExtensionObjects): Promise<Disposable>

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
}

/**
 * Gets the ExtensionClient implementation for VSCode.
 */
export function defaultVSCodeExtensionClient(): ExtensionClient {
    return {
        provide: async goodies => ({
            dispose: () => {},
        }),
        createFixupControlApplicator: files => new FixupCodeLenses(files),
        openNewDocument: (workspace, uri) => workspace.openTextDocument(uri),
        clientName: 'vscode',
        clientVersion: version,
        capabilities: undefined,
    }
}
