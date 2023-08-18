import * as vscode from 'vscode'

import { PreciseContext } from '@sourcegraph/cody-shared'
import { ChatClient } from '@sourcegraph/cody-shared/src/chat/chat'
import { CodebaseContext } from '@sourcegraph/cody-shared/src/codebase-context'
import { ConfigurationWithAccessToken } from '@sourcegraph/cody-shared/src/configuration'
import { Editor } from '@sourcegraph/cody-shared/src/editor'
import { SourcegraphEmbeddingsSearchClient } from '@sourcegraph/cody-shared/src/embeddings/client'
import { SourcegraphGraphQLAPIClient } from '@sourcegraph/cody-shared/src/sourcegraph-api/graphql'
import { TelemetryService } from '@sourcegraph/cody-shared/src/telemetry'
import { convertGitCloneURLToCodebaseName, isError } from '@sourcegraph/cody-shared/src/utils'

import { getFullConfig } from '../configuration'
import { VSCodeEditor } from '../editor/vscode-editor'
import { PlatformContext } from '../extension.common'
import { debug } from '../log'
import { getRerankWithLog } from '../logged-rerank'
import { repositoryRemoteUrl } from '../repository/repositoryHelpers'
import { AuthProvider } from '../services/AuthProvider'
import { LocalStorage } from '../services/LocalStorageProvider'
import { SecretStorage } from '../services/SecretStorageProvider'

import { ChatViewProviderWebview } from './ChatViewProvider'
import { ConfigurationSubsetForWebview, isLocalApp, LocalEnv } from './protocol'

export type Config = Pick<
    ConfigurationWithAccessToken,
    | 'codebase'
    | 'serverEndpoint'
    | 'debugEnable'
    | 'debugFilter'
    | 'debugVerbose'
    | 'customHeaders'
    | 'accessToken'
    | 'useContext'
    | 'experimentalChatPredictions'
    | 'experimentalGuardrails'
    | 'experimentalCommandLenses'
    | 'experimentalEditorTitleCommandIcon'
    | 'experimentalLocalSymbols'
    | 'pluginsEnabled'
    | 'pluginsConfig'
    | 'pluginsDebugEnabled'
>

export enum ContextEvent {
    Auth = 'auth',
}

export class ContextProvider implements vscode.Disposable {
    // We fire messages from ContextProvider to the sidebar webview.
    // TODO(umpox): Should we add support for showing context in other places (i.e. within inline chat)?
    public webview?: ChatViewProviderWebview

    // Fire event to let subscribers know that the configuration has changed
    public configurationChangeEvent = new vscode.EventEmitter<void>()

    // Codebase-context-related state
    public currentWorkspaceRoot: string

    protected disposables: vscode.Disposable[] = []

    constructor(
        public config: Omit<Config, 'codebase'>, // should use codebaseContext.getCodebase() rather than config.codebase
        private chat: ChatClient,
        private codebaseContext: CodebaseContext,
        private editor: VSCodeEditor,
        private secretStorage: SecretStorage,
        private localStorage: LocalStorage,
        private rgPath: string | null,
        private authProvider: AuthProvider,
        private telemetryService: TelemetryService,
        private platform: PlatformContext
    ) {
        this.disposables.push(this.configurationChangeEvent)

        this.currentWorkspaceRoot = ''
        this.disposables.push(
            vscode.window.onDidChangeActiveTextEditor(async () => {
                await this.updateCodebaseContext()
            }),
            vscode.workspace.onDidChangeWorkspaceFolders(async () => {
                await this.updateCodebaseContext()
            }),
            vscode.commands.registerCommand('cody.auth.sync', () => this.syncAuthStatus())
        )
    }

    public get context(): CodebaseContext {
        return this.codebaseContext
    }

    public async init(): Promise<void> {
        await this.updateCodebaseContext()
        await this.publishContextStatus()
    }

    public onConfigurationChange(newConfig: Config): void {
        debug('ContextProvider:onConfigurationChange', '')
        this.config = newConfig
        const authStatus = this.authProvider.getAuthStatus()
        if (authStatus.endpoint) {
            this.config.serverEndpoint = authStatus.endpoint
        }
        this.configurationChangeEvent.fire()
    }

    private async updateCodebaseContext(): Promise<void> {
        if (!this.editor.getActiveTextEditor() && vscode.window.visibleTextEditors.length !== 0) {
            // these are ephemeral
            return
        }
        const workspaceRoot = this.editor.getWorkspaceRootPath()
        if (!workspaceRoot || workspaceRoot === '' || workspaceRoot === this.currentWorkspaceRoot) {
            return
        }
        this.currentWorkspaceRoot = workspaceRoot

        const codebaseContext = await getCodebaseContext(
            this.config,
            this.rgPath,
            this.editor,
            this.chat,
            this.telemetryService,
            this.platform
        )
        if (!codebaseContext) {
            return
        }
        // after await, check we're still hitting the same workspace root
        if (this.currentWorkspaceRoot !== workspaceRoot) {
            return
        }

        this.codebaseContext = codebaseContext
        await this.publishContextStatus()
    }

    /**
     * Save, verify, and sync authStatus between extension host and webview
     * activate extension when user has valid login
     */
    public async syncAuthStatus(): Promise<void> {
        const authStatus = this.authProvider.getAuthStatus()
        // Update config to the latest one and fire configure change event to update external services
        const newConfig = await getFullConfig(this.secretStorage, this.localStorage)
        if (authStatus.siteVersion) {
            // Update codebase context
            const codebaseContext = await getCodebaseContext(
                newConfig,
                this.rgPath,
                this.editor,
                this.chat,
                this.telemetryService,
                this.platform
            )
            if (codebaseContext) {
                this.codebaseContext = codebaseContext
            }
        }
        await this.publishConfig()
        this.onConfigurationChange(newConfig)
        // When logged out, user's endpoint will be set to null
        const isLoggedOut = !authStatus.isLoggedIn && !authStatus.endpoint
        const isAppEvent = isLocalApp(authStatus.endpoint || '') ? 'app:' : ''
        const eventValue = isLoggedOut ? 'disconnected' : authStatus.isLoggedIn ? 'connected' : 'failed'
        // e.g. auth:app:connected, auth:app:disconnected, auth:failed
        this.sendEvent(ContextEvent.Auth, isAppEvent + eventValue)
    }

    /**
     * Publish the current context status to the webview.
     */
    private async publishContextStatus(): Promise<void> {
        const send = async (): Promise<void> => {
            const editorContext = this.editor.getActiveTextEditor()
            await this.webview?.postMessage({
                type: 'contextStatus',
                contextStatus: {
                    mode: this.config.useContext,
                    connection: this.codebaseContext.checkEmbeddingsConnection(),
                    codebase: this.codebaseContext.getCodebase(),
                    filePath: editorContext ? vscode.workspace.asRelativePath(editorContext.filePath) : undefined,
                    selectionRange: editorContext ? editorContext.selectionRange : undefined,
                    supportsKeyword: true,
                },
            })
        }
        this.disposables.push(this.configurationChangeEvent.event(() => send()))
        this.disposables.push(vscode.window.onDidChangeActiveTextEditor(() => send()))
        this.disposables.push(vscode.window.onDidChangeTextEditorSelection(() => send()))
        return send()
    }

    /**
     * Publish the config to the webview.
     */
    private async publishConfig(): Promise<void> {
        const send = async (): Promise<void> => {
            this.config = await getFullConfig(this.secretStorage, this.localStorage)

            // check if the new configuration change is valid or not
            const authStatus = this.authProvider.getAuthStatus()
            const localProcess = await this.authProvider.appDetector.getProcessInfo(authStatus.isLoggedIn)
            const configForWebview: ConfigurationSubsetForWebview & LocalEnv = {
                ...localProcess,
                debugEnable: this.config.debugEnable,
                serverEndpoint: this.config.serverEndpoint,
                pluginsEnabled: this.config.pluginsEnabled,
                pluginsDebugEnabled: this.config.pluginsDebugEnabled,
            }

            // update codebase context on configuration change
            await this.updateCodebaseContext()
            await this.webview?.postMessage({ type: 'config', config: configForWebview, authStatus })
            debug('Cody:publishConfig', 'configForWebview', { verbose: configForWebview })
        }

        await send()
    }

    /**
     * Log Events - naming convention: source:feature:action
     */
    private sendEvent(event: ContextEvent, value: string): void {
        switch (event) {
            case 'auth':
                this.telemetryService.log(`CodyVSCodeExtension:Auth:${value}`)
                break
        }
    }

    public dispose(): void {
        for (const disposable of this.disposables) {
            disposable.dispose()
        }
        this.disposables = []
    }
}

/**
 * Gets codebase context for the current workspace.
 *
 * @param config Cody configuration
 * @param rgPath Path to rg (ripgrep) executable
 * @param editor Editor instance
 * @returns CodebaseContext if a codebase can be determined, else null
 */
export async function getCodebaseContext(
    config: Config,
    rgPath: string | null,
    editor: Editor,
    chatClient: ChatClient,
    telemetryService: TelemetryService,
    platform: PlatformContext
): Promise<CodebaseContext | null> {
    const client = new SourcegraphGraphQLAPIClient(config)
    const workspaceRoot = editor.getWorkspaceRootUri()
    if (!workspaceRoot) {
        return null
    }
    const remoteUrl = repositoryRemoteUrl(workspaceRoot)
    // Get codebase from config or fallback to getting repository name from git clone URL
    const codebase = config.codebase || (remoteUrl ? convertGitCloneURLToCodebaseName(remoteUrl) : null)
    if (!codebase) {
        return null
    }
    // Check if repo is embedded in endpoint
    const repoId = await client.getRepoIdIfEmbeddingExists(codebase)
    if (isError(repoId)) {
        const infoMessage = `Cody could not find embeddings for '${codebase}' on your Sourcegraph instance.\n`
        console.info(infoMessage)
        return null
    }

    const embeddingsSearch = repoId && !isError(repoId) ? new SourcegraphEmbeddingsSearchClient(client, repoId) : null
    return new CodebaseContext(
        config,
        codebase,
        embeddingsSearch,
        rgPath
            ? platform.createLocalKeywordContextFetcher?.(rgPath, editor, chatClient, telemetryService) ?? null
            : null,
        rgPath ? platform.createFilenameContextFetcher?.(rgPath, editor, chatClient) ?? null : null,
        { getContext: () => getGraphContextFromEditor(editor) },
        undefined,
        getRerankWithLog(chatClient)
    )
}

const identifierPattern = /[$A-Z_a-z][\w$]*/g

const goKeywords = new Set([
    'break',
    'case',
    'chan',
    'const',
    'continue',
    'default',
    'defer',
    'else',
    'fallthrough',
    'for',
    'func',
    'go',
    'goto',
    'if',
    'import',
    'interface',
    'map',
    'package',
    'range',
    'return',
    'select',
    'struct',
    'switch',
    'type',
    'var',
])

const typescriptKeywords = new Set([
    'any',
    'as',
    'boolean',
    'break',
    'case',
    'catch',
    'class',
    'const',
    'constructor',
    'continue',
    'debugger',
    'declare',
    'default',
    'delete',
    'do',
    'else',
    'enum',
    'export',
    'extends',
    'false',
    'finally',
    'for',
    'from',
    'function',
    'if',
    'implements',
    'import',
    'in',
    'instanceof',
    'interface',
    'let',
    'module',
    'new',
    'null',
    'number',
    'of',
    'package',
    'private',
    'protected',
    'public',
    'require',
    'return',
    'static',
    'string',
    'super',
    'switch',
    'symbol',
    'this',
    'throw',
    'true',
    'try',
    'type',
    'typeof',
    'var',
    'void',
    'while',
    'with',
    'yield',
])

const commonKeywords = new Set([...goKeywords, ...typescriptKeywords])

interface SymbolDefinitionMatches {
    symbolName: string
    locations: Thenable<vscode.Location[]>
}

/**
 * Return the definitions of symbols that occur within the editor's active document.
 * If there is an active selection, we will cull the symbols to those referenced in
 * intersecting folding ranges.
 */
async function getGraphContextFromEditor(editor: Editor): Promise<PreciseContext[]> {
    const activeEditor = editor.getActiveTextEditor()
    const workspaceRootUri = editor.getWorkspaceRootUri()
    if (!activeEditor || !workspaceRootUri) {
        return []
    }

    const label = 'precise context - vscode api'
    performance.mark(label)

    // Construct vscode.URI for the open file to interface with LSP queries
    const activeEditorFileUri = workspaceRootUri.with({ path: activeEditor.filePath })

    // Split content of active editor into lines (we slice this many times array below)
    const activeEditorLines = activeEditor.content.split('\n')

    // Get the folding ranges of the current file, which will give us indication of where
    // the user selection and cursor is located (which we assume to be the most relevant
    // code to the current question).
    const foldingRanges = await vscode.commands.executeCommand<vscode.FoldingRange[]>(
        'vscode.executeFoldingRangeProvider',
        activeEditorFileUri
    )

    // Filter the folding ranges to just those intersecting the selection, if one exists
    const selectionRange = activeEditor.selectionRange
    const relevantFoldingRanges = selectionRange
        ? foldingRanges.filter(({ start, end }) => start <= selectionRange.end.line && selectionRange.start.line <= end)
        : foldingRanges

    // Construct a list of symbol and definition location pairs by querying the LSP server
    // with all identifiers (heuristically chosen via regex) in the relevant code ranges.

    const definitionMatches: SymbolDefinitionMatches[] = []
    for (const foldingRange of relevantFoldingRanges) {
        // TODO(efritz) - check for re-processing
        for (const [lineIndex, line] of activeEditorLines.slice(foldingRange.start, foldingRange.end).entries()) {
            for (const match of line.matchAll(identifierPattern)) {
                if (match.index === undefined || commonKeywords.has(match[0])) {
                    continue
                }

                definitionMatches.push({
                    symbolName: match[0],
                    locations: vscode.commands
                        .executeCommand<(vscode.Location | vscode.LocationLink)[]>(
                            'vscode.executeDefinitionProvider',
                            activeEditorFileUri,
                            new vscode.Position(foldingRange.start + lineIndex, match.index + 1)
                        )
                        .then(locations =>
                            locations.flatMap(m =>
                                isLocationLink(m) ? new vscode.Location(m.targetUri, m.targetRange) : m
                            )
                        ),
                })
            }
        }
    }

    // Resolve, extract, and deduplicate the URIs distinct from the active editor file
    const extractedUris = definitionMatches.map(async ({ locations }) => (await locations).map(({ uri }) => uri))
    const allUris = (await Promise.all(extractedUris)).flat()
    const uris = dedupeWith(allUris, uri => uri.fsPath).filter(uri => uri.fsPath !== activeEditorFileUri.fsPath)

    // Resolve, extract, and deduplicate the symbol and location match pairs from the definition queries above
    const extractedMatches = definitionMatches.map(async ({ symbolName, locations }) =>
        (await locations).map(location => ({ symbolName, location }))
    )
    const allMatches = (await Promise.all(extractedMatches)).flat()
    const matches = dedupeWith(allMatches, ({ location }) => locationKeyFn(location))

    // Open each URI in the current workspace, and make the document content retrievable by filepath
    const contentMap = new Map(
        uris.map(uri => [
            uri.fsPath,
            vscode.workspace.openTextDocument(uri.fsPath).then(document => document.getText().split('\n')),
        ])
    )

    // NOTE: Before asking for data about a document it must be opened in the workspace. Force a
    // resolution here otherwise the following folding range query will fail non-deterministically.
    await Promise.all([...contentMap.values()])

    // Retrieve folding ranges for each of the open documents, which we will use to extract the relevant
    // definition "bounds" given the range of the definition symbol (which is contained within the range).
    const foldingRangesMap = new Map(
        uris.map(uri => [
            uri.fsPath,
            vscode.commands.executeCommand<vscode.FoldingRange[]>('vscode.executeFoldingRangeProvider', uri),
        ])
    )

    // NOTE: In order to make sure the loop below is unblocked we'll also force resolve the entirety
    // of the folding range requests. That way we don't have a situation where the first iteration of
    // the loop is waiting on the last promise to be resolved in the set.
    await Promise.all([...foldingRangesMap.values()])

    // Piece everything together. For each matching definition, extract the relevant lines given the
    // containing document's content and folding range result. Downstream consumers of this function
    // are expected to filter and re-rank these results as needed for their specific use case.

    const contexts: PreciseContext[] = []
    for (const { symbolName, location } of matches) {
        const { uri, range } = location
        const contentPromise = contentMap.get(uri.fsPath)
        const foldingRangesPromise = foldingRangesMap.get(uri.fsPath)

        if (contentPromise && foldingRangesPromise) {
            const content = await contentPromise // note: already resolved
            const foldingRanges = await foldingRangesPromise // note: already resolved
            const definitionSnippets = extractSnippets(content, foldingRanges, [range])

            for (const definitionSnippet of definitionSnippets) {
                contexts.push({
                    symbol: {
                        fuzzyName: symbolName,
                    },
                    filePath: uri.fsPath,
                    range: {
                        startLine: range.start.line,
                        startCharacter: range.start.character,
                        endLine: range.end.line,
                        endCharacter: range.end.character,
                    },
                    definitionSnippet,
                })
            }
        }
    }

    console.debug(`Retrieved ${contexts.length} non-file-local context snippets`)
    performance.mark(label)
    return contexts
}

/**
 * Return a filtered version of the given array, de-duplicating items based on the given key function.
 * The order of the filtered array is not guaranteed to be related to the input ordering.
 */
const dedupeWith = <T>(items: T[], keyFn: (item: T) => string): T[] => [
    ...new Map(items.map(item => [keyFn(item), item])).values(),
]

/**
 * Returns a key unique to a given location for use with `dedupeWith`.
 */
const locationKeyFn = (location: vscode.Location): string =>
    `${location.uri}?L${location.range.start.line}:${location.range.start.character}`

/**
 * Extract the content outlined by folding ranges that intersect one of the target ranges.
 */
const extractSnippets = (lines: string[], foldingRanges: vscode.FoldingRange[], ranges: vscode.Range[]): string[] =>
    foldingRanges
        .filter(fr => ranges.some(r => fr.start <= r.start.line && r.end.line <= fr.end))
        .map(fr =>
            lines
                // TODO(efritz) - check if we're capturing a parent folding range
                .slice(fr.start, fr.end + 3)
                .join('\n')
        )

const isLocationLink = (p: vscode.Location | vscode.LocationLink): p is vscode.LocationLink =>
    (p as vscode.LocationLink).targetUri !== undefined
