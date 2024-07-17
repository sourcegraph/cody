import { execSync } from 'node:child_process'
import path from 'node:path'

import { extensionForLanguage, logDebug, logError, setClientNameVersion } from '@sourcegraph/cody-shared'
import * as uuid from 'uuid'
import type * as vscode from 'vscode'

// <VERY IMPORTANT - PLEASE READ>
// This file must not import any module that transitively imports from 'vscode'.
// It's only OK to `import type` from vscode. We can't depend on any vscode APIs
// to implement this this file because this file is responsible for implementing
// VS Code APIs resulting in cyclic dependencies.

// This will automatically be checked when running build:agent but if we did
// make a mistake and transitively import vscode you most likely hit an error
// like this:
//
//     /pkg/prelude/bootstrap.js:1926
//     return wrapper.apply(this.exports, args);
//                    ^
//     TypeError: Cannot read properties of undefined (reading 'getConfiguration')
//     at Object.<anonymous> (/snapshot/dist/agent.js)
//     at Module._compile (pkg/prelude/bootstrap.js:1926:22)
// </VERY IMPORTANT>
import type { InlineCompletionItemProvider } from '../../vscode/src/completions/inline-completion-item-provider'
import type { API, GitExtension, Repository } from '../../vscode/src/repository/builtinGitExtension'
import { AgentEventEmitter as EventEmitter } from '../../vscode/src/testutils/AgentEventEmitter'
import { emptyEvent } from '../../vscode/src/testutils/emptyEvent'
import {
    CancellationTokenSource,
    ColorThemeKind,
    CommentThreadCollapsibleState,
    // It's OK to import the VS Code mocks because they don't depend on the 'vscode' module.
    Disposable,
    ExtensionKind,
    FileType,
    LogLevel,
    ProgressLocation,
    Range,
    StatusBarAlignment,
    UIKind,
    Uri,
    ViewColumn,
    workspaceFs,
} from '../../vscode/src/testutils/mocks'

import { emptyDisposable } from '../../vscode/src/testutils/emptyDisposable'

import open from 'open'
import { AgentDiagnostics } from './AgentDiagnostics'
import { AgentQuickPick } from './AgentQuickPick'
import { AgentTabGroups } from './AgentTabGroups'
import { AgentWorkspaceConfiguration } from './AgentWorkspaceConfiguration'
import type { Agent } from './agent'
import { matchesGlobPatterns } from './cli/command-bench/matchesGlobPatterns'
import type { ClientInfo, ExtensionConfiguration } from './protocol-alias'

// Not using CODY_TESTING because it changes the URL endpoint we send requests
// to and we want to send requests to sourcegraph.com because we record the HTTP
// traffic.
export const isTesting = process.env.CODY_SHIM_TESTING === 'true'

// The testing code paths sometimes need to distinguish the different types of testing.
export const isIntegrationTesting = process.env.CODY_CLIENT_INTEGRATION_TESTING === 'true'

export { AgentEventEmitter as EventEmitter } from '../../vscode/src/testutils/AgentEventEmitter'

export {
    CancellationTokenSource,
    CodeAction,
    CodeActionTriggerKind,
    CodeActionKind,
    CodeLens,
    CommentMode,
    CommentThreadCollapsibleState,
    ConfigurationTarget,
    TextEditorRevealType,
    DiagnosticSeverity,
    FoldingRange,
    Disposable,
    EndOfLine,
    ExtensionMode,
    FileType,
    InlineCompletionItem,
    InlineCompletionTriggerKind,
    DiagnosticRelatedInformation,
    Location,
    MarkdownString,
    OverviewRulerLane,
    DecorationRangeBehavior,
    Position,
    ProgressLocation,
    QuickInputButtons,
    QuickPickItemKind,
    Range,
    RelativePattern,
    Selection,
    StatusBarAlignment,
    SymbolKind,
    TextDocumentChangeReason,
    ThemeColor,
    ThemeIcon,
    TreeItem,
    TreeItemCollapsibleState,
    UIKind,
    Uri,
    ViewColumn,
    WorkspaceEdit,
} from '../../vscode/src/testutils/mocks'

const emptyFileWatcher: vscode.FileSystemWatcher = {
    onDidChange: emptyEvent(),
    onDidCreate: emptyEvent(),
    onDidDelete: emptyEvent(),
    ignoreChangeEvents: true,
    ignoreCreateEvents: true,
    ignoreDeleteEvents: true,
    dispose(): void {},
}
export let clientInfo: ClientInfo | undefined
export function setClientInfo(newClientInfo: ClientInfo): void {
    clientInfo = newClientInfo
    setClientNameVersion(clientInfo.name, clientInfo.version)
    if (newClientInfo.extensionConfiguration) {
        setExtensionConfiguration(newClientInfo.extensionConfiguration)
    }
}

export let extensionConfiguration: ExtensionConfiguration | undefined
export function setExtensionConfiguration(newConfig: ExtensionConfiguration): void {
    extensionConfiguration = newConfig
}
export function isAuthenticationChange(newConfig: ExtensionConfiguration): boolean {
    if (!extensionConfiguration) {
        return true
    }

    if (!newConfig.accessToken || !newConfig.serverEndpoint) {
        return false
    }

    return (
        extensionConfiguration.accessToken !== newConfig.accessToken ||
        extensionConfiguration.serverEndpoint !== newConfig.serverEndpoint
    )
}

const configuration = new AgentWorkspaceConfiguration(
    [],
    () => clientInfo,
    () => extensionConfiguration
)

export const onDidChangeWorkspaceFolders = new EventEmitter<vscode.WorkspaceFoldersChangeEvent>()
export const onDidChangeTextEditorSelection = new EventEmitter<vscode.TextEditorSelectionChangeEvent>() // TODO: implement this
export const onDidChangeVisibleTextEditors = new EventEmitter<readonly vscode.TextEditor[]>()
export const onDidChangeActiveTextEditor = new EventEmitter<vscode.TextEditor | undefined>()
export const onDidChangeConfiguration = new EventEmitter<vscode.ConfigurationChangeEvent>()
export const onDidOpenTextDocument = new EventEmitter<vscode.TextDocument>()
export const onDidChangeTextDocument = new EventEmitter<vscode.TextDocumentChangeEvent>()
export const onDidCloseTextDocument = new EventEmitter<vscode.TextDocument>()
export const onDidSaveTextDocument = new EventEmitter<vscode.TextDocument>()
export const onDidRenameFiles = new EventEmitter<vscode.FileRenameEvent>()
export const onDidDeleteFiles = new EventEmitter<vscode.FileDeleteEvent>()

export interface WorkspaceDocuments {
    workspaceRootUri?: vscode.Uri
    openTextDocument: (uri: vscode.Uri) => Promise<vscode.TextDocument>
    newTextEditorFromStringUri: (uri: string) => Promise<vscode.TextEditor>
}
let workspaceDocuments: WorkspaceDocuments | undefined
export function setWorkspaceDocuments(newWorkspaceDocuments: WorkspaceDocuments): void {
    workspaceDocuments = newWorkspaceDocuments
    if (newWorkspaceDocuments.workspaceRootUri) {
        if (
            !workspaceFolders
                .map(wf => wf.uri.toString())
                .includes(newWorkspaceDocuments.workspaceRootUri.toString())
        ) {
            setWorkspaceFolders(newWorkspaceDocuments.workspaceRootUri)
        }
    }
}

export function setWorkspaceFolders(workspaceRootUri: vscode.Uri): vscode.WorkspaceFolder[] {
    // TODO: Update this when we support multiple workspace roots
    while (workspaceFolders.pop()) {
        // clear workspaceFolders array
    }

    workspaceFolders.push({
        name: path.basename(workspaceRootUri.toString()),
        uri: workspaceRootUri,
        index: 0,
    })

    return workspaceFolders
}

export const workspaceFolders: vscode.WorkspaceFolder[] = []
export const workspaceTextDocuments: vscode.TextDocument[] = []

// vscode.workspace.onDidChangeConfiguration
const _workspace: typeof vscode.workspace = {
    rootPath: undefined,
    onDidChangeNotebookDocument: emptyEvent(),
    onDidCloseNotebookDocument: emptyEvent(),
    onDidCreateFiles: emptyEvent(),
    onDidGrantWorkspaceTrust: emptyEvent(),
    onDidOpenNotebookDocument: emptyEvent(),
    onDidSaveNotebookDocument: emptyEvent(),
    onWillCreateFiles: emptyEvent(),
    onWillDeleteFiles: emptyEvent(),
    onWillRenameFiles: emptyEvent(),
    onWillSaveNotebookDocument: emptyEvent(),
    onWillSaveTextDocument: emptyEvent(),
    applyEdit: (edit, metadata) => {
        if (agent) {
            return agent.applyWorkspaceEdit(edit, metadata)
        }
        logError('vscode.workspace.applyEdit', 'agent is undefined')
        return Promise.resolve(false)
    },
    isTrusted: true,
    name: undefined,
    notebookDocuments: [],
    openNotebookDocument: (() => {}) as any,
    registerFileSystemProvider: () => emptyDisposable,
    registerNotebookSerializer: () => emptyDisposable,
    saveAll: () => Promise.resolve(false),
    textDocuments: workspaceTextDocuments,
    updateWorkspaceFolders: () => false,
    workspaceFile: undefined,
    registerTaskProvider: () => emptyDisposable,
    async findFiles(include, exclude, maxResults, token) {
        let searchFolders: vscode.WorkspaceFolder[]
        let searchPattern: string

        if (typeof include === 'string') {
            searchFolders = workspaceFolders
            searchPattern = include
        } else {
            const matchingWorkspaceFolder = workspaceFolders.find(
                wf => wf.uri.toString() === include.baseUri.toString()
            )
            if (!matchingWorkspaceFolder) {
                throw new TypeError(
                    `workspaces.findFiles: RelativePattern must use a known WorkspaceFolder\n  Got: ${
                        include.baseUri
                    }\n  Known:\n${workspaceFolders.map(wf => `  - ${wf.uri.toString()}\n`).join()}`
                )
            }
            searchFolders = [matchingWorkspaceFolder]
            searchPattern = include.pattern
        }

        if (exclude !== undefined && typeof exclude !== 'string') {
            throw new TypeError('workspaces.findFiles: exclude must be a string')
        }

        const result: vscode.Uri[] = []
        const loop = async (workspaceRoot: vscode.Uri, dir: vscode.Uri): Promise<void> => {
            if (token?.isCancellationRequested) {
                return
            }
            const files = await workspaceFs.readDirectory(dir)
            for (const [name, fileType] of files) {
                const uri = Uri.file(path.join(dir.fsPath, name))
                const relativePath = path.relative(workspaceRoot.fsPath, uri.fsPath)

                if (fileType.valueOf() === FileType.Directory.valueOf()) {
                    if (!matchesGlobPatterns([], exclude ? [exclude] : [], relativePath)) {
                        continue
                    }
                    await loop(workspaceRoot, uri)
                } else if (fileType.valueOf() === FileType.File.valueOf()) {
                    if (
                        !matchesGlobPatterns(
                            searchPattern ? [searchPattern] : [],
                            exclude ? [exclude] : [],
                            relativePath
                        )
                    ) {
                        continue
                    }

                    result.push(uri)
                    if (maxResults !== undefined && result.length >= maxResults) {
                        return
                    }
                }
            }
        }

        await Promise.all(
            searchFolders.map(async folder => {
                try {
                    const stat = await workspaceFs.stat(folder.uri)
                    if (stat.type.valueOf() === FileType.Directory.valueOf()) {
                        await loop(folder.uri, folder.uri)
                    }
                } catch (error) {
                    console.error(
                        `workspace.workspace.findFiles: failed to stat workspace folder ${folder.uri}. Error ${error}`,
                        new Error().stack
                    )
                }
            })
        )
        return result
    },
    openTextDocument: async uriOrString => {
        if (!workspaceDocuments) {
            throw new Error('workspaceDocuments is uninitialized')
        }

        const uri = toUri(uriOrString)
        return uri
            ? workspaceDocuments.openTextDocument(uri)
            : Promise.reject(
                  new Error(
                      `workspace.openTextDocument: unsupported argument ${JSON.stringify(uriOrString)}`
                  )
              )
    },
    workspaceFolders,
    getWorkspaceFolder: () => {
        // TODO: support multiple workspace roots
        if (workspaceDocuments?.workspaceRootUri === undefined) {
            throw new Error(
                'workspaceDocuments is undefined. To fix this problem, make sure that the agent has been initialized.'
            )
        }
        return {
            uri: workspaceDocuments.workspaceRootUri,
            index: 0,
            name: workspaceDocuments.workspaceRootUri?.path,
        }
    },
    // TODO: used by `WorkspaceRepoMapper` and will be used by `git.onDidOpenRepository`
    // https://github.com/sourcegraph/cody/issues/4136
    onDidChangeWorkspaceFolders: onDidChangeWorkspaceFolders.event,
    onDidOpenTextDocument: onDidOpenTextDocument.event,
    onDidChangeConfiguration: onDidChangeConfiguration.event,
    onDidChangeTextDocument: onDidChangeTextDocument.event,
    onDidCloseTextDocument: onDidCloseTextDocument.event,
    onDidSaveTextDocument: onDidSaveTextDocument.event, // TODO: used by fixup controller to hide code lenses
    onDidRenameFiles: onDidRenameFiles.event, // TODO: used by persistence tracker
    onDidDeleteFiles: onDidDeleteFiles.event, // TODO: used by persistence tracker
    registerTextDocumentContentProvider: () => emptyDisposable, // TODO: used by fixup controller
    asRelativePath: (pathOrUri: string | vscode.Uri): string => {
        const uri: vscode.Uri | undefined =
            typeof pathOrUri === 'string'
                ? Uri.file(pathOrUri)
                : pathOrUri instanceof Uri
                  ? pathOrUri
                  : undefined
        if (uri === undefined) {
            // Not sure what to do about non-string/non-uri arguments.
            return `${pathOrUri}`
        }

        const relativePath = workspaceDocuments?.workspaceRootUri?.fsPath
            ? path.relative(workspaceDocuments?.workspaceRootUri?.path ?? '', uri.path)
            : uri.path
        if (isTesting) {
            // We insert relative paths in a lot of places like prompts that influence HTTP requests.
            // When testing, we try to normalize the file paths across Windows/Linux/macOS.
            return relativePath.replaceAll('\\', '/')
        }
        return relativePath
    },
    // TODO: used for Cody Context Filters, WorkspaceRepoMapper and custom commands
    // https://github.com/sourcegraph/cody/issues/4136
    createFileSystemWatcher: () => emptyFileWatcher,
    getConfiguration: (section, scope): vscode.WorkspaceConfiguration => {
        if (section !== undefined) {
            if (scope === undefined) {
                return configuration.withPrefix(section)
            }

            // Ignore language-scoped configuration sections like
            // '[jsonc].editor.insertSpaces', fallback to global scope instead.
            if (section.startsWith('[')) {
                return configuration
            }
        }
        return configuration
    },
    fs: workspaceFs,
}

export const workspace = _workspace

const statusBarItem: vscode.StatusBarItem = {
    show: () => {},
    dispose: () => {},
    alignment: StatusBarAlignment.Left,
    hide: () => {},
    text: '',
    id: 'id',
    priority: undefined,
    tooltip: undefined,
    accessibilityInformation: undefined,
    backgroundColor: undefined,
    color: undefined,
    command: undefined,
    name: undefined,
}
export const visibleTextEditors: vscode.TextEditor[] = []

export const tabGroups = new AgentTabGroups()
let agent: Agent | undefined
export function setAgent(newAgent: Agent): void {
    agent = newAgent
}

export function defaultWebviewPanel(params: {
    viewType: string
    title: string
    showOptions:
        | vscode.ViewColumn
        | {
              readonly viewColumn: vscode.ViewColumn
              readonly preserveFocus?: boolean
          }
    options: (vscode.WebviewPanelOptions & vscode.WebviewOptions) | undefined
    onDidReceiveMessage: vscode.EventEmitter<any>
    onDidPostMessage: EventEmitter<any>
}): vscode.WebviewPanel {
    return {
        active: false,
        dispose: () => {},
        onDidChangeViewState: emptyEvent(),
        onDidDispose: emptyEvent(),
        options: params.options ?? {
            enableFindWidget: false,
            retainContextWhenHidden: false,
        },
        reveal: () => {},
        title: params.title,
        viewColumn:
            typeof params.showOptions === 'number' ? params.showOptions : params.showOptions.viewColumn,
        viewType: params.viewType,
        visible: false,
        webview: {
            asWebviewUri(localResource) {
                return localResource
            },
            cspSource: 'cspSource',
            html: '<p>html</p>',
            onDidReceiveMessage: params.onDidReceiveMessage.event,
            options: {},
            postMessage: async message => {
                await params.onDidPostMessage.cody_fireAsync(message)
                return true
            },
        },
    }
}
const defaultTreeView: vscode.TreeView<any> = {
    dispose: () => {},
    onDidChangeCheckboxState: emptyEvent(),
    onDidChangeSelection: emptyEvent(),
    onDidChangeVisibility: emptyEvent(),
    onDidCollapseElement: emptyEvent(),
    onDidExpandElement: emptyEvent(),
    reveal: () => Promise.resolve(),
    selection: [],
    visible: false,
    badge: undefined,
    description: undefined,
    message: undefined,
    title: undefined,
}

function toUri(
    uriOrString: string | vscode.Uri | { language?: string; content?: string } | undefined
): Uri | undefined {
    if (typeof uriOrString === 'string') {
        return Uri.parse(uriOrString)
    }
    if (uriOrString instanceof Uri) {
        return uriOrString
    }
    if (
        typeof uriOrString === 'object' &&
        ((uriOrString as any)?.language || (uriOrString as any)?.content)
    ) {
        const language = (uriOrString as any)?.language ?? ''
        const extension = extensionForLanguage(language) ?? language
        return Uri.from({
            scheme: 'untitled',
            path: `${uuid.v4()}.${extension}`,
        })
    }
    return
}

function outputChannel(name: string): vscode.LogOutputChannel {
    return {
        name,
        append: message => {
            if (agent) {
                agent.notify('debug/message', { channel: name, message })
            }
        },
        appendLine: message => {
            if (agent) {
                agent.notify('debug/message', { channel: name, message })
            }
        },
        replace: message => {
            if (agent) {
                agent.notify('debug/message', { channel: name, message })
            }
        },
        clear: () => {},
        show: () => {},
        hide: () => {},
        dispose: () => {},
        trace: () => {},
        debug: () => {},
        info: () => {},
        warn: () => {},
        error: () => {},
        logLevel: LogLevel.Trace,
        onDidChangeLogLevel: emptyEvent(),
    }
}

const webviewPanel: vscode.WebviewPanel = defaultWebviewPanel({
    viewType: 'agent',
    title: 'Agent',
    showOptions: ViewColumn.One,
    options: undefined,
    onDidReceiveMessage: new EventEmitter<any>(),
    onDidPostMessage: new EventEmitter<any>(),
})

let shimmedCreateWebviewPanel: typeof vscode.window.createWebviewPanel = () => {
    return webviewPanel
}

export function setCreateWebviewPanel(
    newCreateWebviewPanel: typeof vscode.window.createWebviewPanel
): void {
    shimmedCreateWebviewPanel = newCreateWebviewPanel
}

export const progressBars = new Map<string, CancellationTokenSource>()

async function showWindowMessage(
    severity: 'error' | 'warning' | 'information',
    message: string,
    options: vscode.MessageOptions | string,
    items: string[]
): Promise<string | undefined> {
    if (agent) {
        if (clientInfo?.capabilities?.showWindowMessage === 'request') {
            const result = await agent.request('window/showMessage', {
                severity,
                message,
                options: typeof options === 'object' ? options : undefined,
                items: typeof options === 'object' ? items : [options, ...items],
            })
            return result ?? undefined
        }
        agent.notify('debug/message', {
            channel: 'window.showErrorMessage',
            message,
        })
    }
    return Promise.resolve(undefined)
}

const _window: typeof vscode.window = {
    createTreeView: () => defaultTreeView,
    tabGroups,
    createWebviewPanel: (...params) => {
        return shimmedCreateWebviewPanel(...params)
    },
    registerCustomEditorProvider: () => emptyDisposable,
    registerFileDecorationProvider: () => emptyDisposable,
    registerTerminalLinkProvider: () => emptyDisposable,
    registerTerminalProfileProvider: () => emptyDisposable,
    registerTreeDataProvider: () => emptyDisposable,
    registerWebviewPanelSerializer: () => emptyDisposable,
    onDidChangeTextEditorVisibleRanges: emptyEvent(),
    onDidChangeActiveColorTheme: emptyEvent(),
    onDidChangeActiveNotebookEditor: emptyEvent(),
    onDidChangeActiveTerminal: emptyEvent(),
    onDidChangeNotebookEditorSelection: emptyEvent(),
    onDidChangeNotebookEditorVisibleRanges: emptyEvent(),
    onDidChangeTerminalState: emptyEvent(),
    onDidChangeTextEditorOptions: emptyEvent(),
    onDidChangeTextEditorViewColumn: emptyEvent(),
    onDidChangeVisibleNotebookEditors: emptyEvent(),
    onDidChangeWindowState: emptyEvent(),
    onDidCloseTerminal: emptyEvent(),
    onDidOpenTerminal: emptyEvent(),
    registerUriHandler: () => emptyDisposable,
    registerWebviewViewProvider: (
        viewId: string,
        provider: vscode.WebviewViewProvider,
        options?: { webviewOptions?: { retainContextWhenHidden?: boolean } }
    ) => {
        agent?.webviewViewProviders.set(viewId, provider)
        options ??= {
            webviewOptions: undefined,
        }
        options.webviewOptions ??= {
            retainContextWhenHidden: undefined,
        }
        options.webviewOptions.retainContextWhenHidden ??= false
        agent?.notify('webview/registerWebviewViewProvider', {
            viewId,
            retainContextWhenHidden: options?.webviewOptions.retainContextWhenHidden,
        })
        return emptyDisposable
    },
    createStatusBarItem: () => statusBarItem,
    visibleTextEditors,
    withProgress: async (options, handler) => {
        const progressClient = clientInfo?.capabilities?.progressBars === 'enabled' ? agent : undefined
        const id = uuid.v4()
        const tokenSource = new CancellationTokenSource()
        const token = tokenSource.token
        progressBars.set(id, tokenSource)
        token.onCancellationRequested(() => progressBars.delete(id))

        if (progressClient) {
            const location =
                typeof options.location === 'number' ? ProgressLocation[options.location] : undefined
            const locationViewId =
                typeof options.location === 'object' ? options.location.viewId : undefined
            progressClient.notify('progress/start', {
                id,
                options: {
                    title: options.title,
                    cancellable: options.cancellable,
                    location,
                    locationViewId,
                },
            })
        }
        try {
            const result = await handler(
                {
                    report: ({ message, increment }) => {
                        if (progressClient && !token.isCancellationRequested) {
                            progressClient.notify('progress/report', {
                                id,
                                message,
                                increment,
                            })
                        }
                    },
                },
                token
            )
            return result
        } catch (error) {
            console.error('window.withProgress: uncaught error', error)
            throw error
        } finally {
            tokenSource.dispose()
            progressBars.delete(id)
            if (progressClient) {
                progressClient.notify('progress/end', { id })
            }
        }
    },
    onDidChangeActiveTextEditor: onDidChangeActiveTextEditor.event,
    onDidChangeVisibleTextEditors: onDidChangeVisibleTextEditors.event,
    onDidChangeTextEditorSelection: onDidChangeTextEditorSelection.event,
    showErrorMessage: (message: string, options: vscode.MessageOptions | any, ...items: any[]) =>
        showWindowMessage('error', message, options, items),
    showWarningMessage: (message: string, options: vscode.MessageOptions | any, ...items: any[]) =>
        showWindowMessage('warning', message, options, items),
    showInformationMessage: (message: string, options: vscode.MessageOptions | any, ...items: any[]) =>
        showWindowMessage('information', message, options, items),
    createOutputChannel: (name: string) => outputChannel(name),
    createTextEditorDecorationType: () => ({ key: 'foo', dispose: () => {} }),
    showTextDocument: async (params, options) => {
        if (agent) {
            if (clientInfo?.capabilities?.showDocument !== 'enabled') {
                throw new Error(
                    'vscode.window.showTextDocument: not supported by client. ' +
                        'To fix this problem, enable `showDocument: "enabled"` in client capabilities'
                )
            }
            const uri = params instanceof Uri ? params.toString() : (params as any)?.uri?.toString?.()
            if (uri === undefined) {
                throw new TypeError(
                    `vscode.window.showTextDocument: unable to infer URI from argument ${params}`
                )
            }
            const selection = (options as any)?.selection
            const selectionRange = selection
                ? new Range(
                      selection.start.line,
                      selection.start.character,
                      selection.end.line,
                      selection.end.character
                  )
                : undefined

            const result = await agent.request('textDocument/show', {
                uri,
                options: {
                    preserveFocus: (options as any)?.preserveFocus ?? true,
                    selection: selectionRange,
                },
            })
            if (!result) {
                throw new Error(`showTextDocument: client returned false when trying to show URI ${uri}`)
            }

            if (!workspaceDocuments) {
                throw new Error('workspaceDocuments is undefined')
            }
            return workspaceDocuments.newTextEditorFromStringUri(uri)
        }
        console.log(new Error().stack)
        throw new Error('Not implemented: vscode.window.showTextDocument')
    },
    showNotebookDocument: () => {
        console.log(new Error().stack)
        throw new Error('Not implemented: vscode.window.showNotebookDocument')
    },
    showQuickPick: () => {
        console.log(new Error().stack)
        // TODO: this API is used a lot. We may need to return undefined
        // to not break functionality.
        throw new Error('Not implemented: vscode.window.showQuickPick')
    },
    showWorkspaceFolderPick: () => {
        console.log(new Error().stack)
        throw new Error('Not implemented: vscode.window.showWorkspaceFolderPick')
    },
    showOpenDialog: () => {
        console.log(new Error().stack)
        throw new Error('Not implemented: vscode.window.showOpenDialog')
    },
    showSaveDialog: () => {
        console.log(new Error().stack)
        throw new Error('Not implemented: vscode.window.showSaveDialog')
    },
    showInputBox: () => {
        console.log(new Error().stack)
        throw new Error('Not implemented: vscode.window.showInputBox')
    },
    createQuickPick: <T extends vscode.QuickPickItem>() => {
        return new AgentQuickPick<T>()
    },
    createInputBox: () => {
        console.log(new Error().stack)
        throw new Error('Not implemented: vscode.window.createInputBox')
    },
    setStatusBarMessage: () => emptyDisposable,
    withScmProgress: () => {
        console.log(new Error().stack)
        throw new Error('Not implemented: vscode.window.withScmProgress')
    },
    createTerminal: () => {
        console.log(new Error().stack)
        throw new Error('Not implemented: vscode.window.createTerminal')
    },
    activeTextEditor: undefined, // Updated by AgentWorkspaceDocuments
    visibleNotebookEditors: [],
    activeNotebookEditor: undefined,
    terminals: [],
    activeTerminal: undefined,
    state: { focused: true },
    activeColorTheme: { kind: ColorThemeKind.Light },
}

export const window = _window
const gitRepositories: Repository[] = []

export function gitRepository(uri: vscode.Uri, headCommit: string): Repository {
    const repo: Partial<Repository> = {
        rootUri: uri,
        ui: { selected: false, onDidChange: emptyEvent() },
        add: () => Promise.resolve(),
        addRemote: () => Promise.resolve(),
        apply: () => Promise.resolve(),
        checkout: () => Promise.resolve(),
        clean: () => Promise.resolve(),
        commit: () => Promise.resolve(),
        createBranch: () => Promise.resolve(),
        deleteBranch: () => Promise.resolve(),
        deleteTag: () => Promise.resolve(),
        pull: () => Promise.resolve(),
        push: () => Promise.resolve(),
        diffBlobs: () => Promise.resolve(''),
        detectObjectType: () => Promise.resolve({ mimetype: 'mimetype' }),
        diffIndexWith: () => Promise.resolve([]) as any,
        diff: () => Promise.resolve(''),
        diffBetween: () => Promise.resolve('') as any,
        blame: () => Promise.resolve(''),
        // buffer: () => Promise.resolve(Buffer.apply('', 'utf-8')),
        buffer: () => Promise.resolve(Buffer.alloc(0)),
        diffIndexWithHEAD: () => Promise.resolve('') as any,
        state: {
            refs: [],
            indexChanges: [],
            mergeChanges: [],
            onDidChange: emptyEvent(),
            remotes: [],
            submodules: [],
            workingTreeChanges: [],
            rebaseCommit: undefined,
            HEAD: {
                type: /* RefType.Head */ 0, // Can't reference RefType.Head because it's from a d.ts file
                commit: headCommit,
            },
        },
    }
    return repo as Repository
}
export function addGitRepository(uri: vscode.Uri, headCommit: string): void {
    gitRepositories.push(gitRepository(uri, headCommit))
}

const gitExports: GitExtension = {
    enabled: true,
    onDidChangeEnablement: emptyEvent(),
    getAPI(version) {
        const api: Partial<API> = {
            repositories: gitRepositories,
            onDidChangeState: emptyEvent(),
            onDidCloseRepository: emptyEvent(),
            onDidOpenRepository: emptyEvent(),
            onDidPublish: emptyEvent(),
            getRepository(uri) {
                try {
                    const cwd = uri.fsPath
                    const toplevel = execSync('git rev-parse --show-toplevel', {
                        cwd,
                        stdio: 'pipe',
                    })
                        .toString()
                        .trim()
                    if (toplevel !== uri.fsPath) {
                        return null
                    }
                    const commit = execSync('git rev-parse --abbrev-ref HEAD', {
                        cwd,
                        stdio: 'pipe',
                    })
                        .toString()
                        .trim()
                    return gitRepository(Uri.file(toplevel), commit)
                } catch {
                    return null
                }
            },
        }
        return api as API
    },
}
const gitExtension: vscode.Extension<GitExtension> = {
    activate: () => Promise.resolve(gitExports),
    extensionKind: ExtensionKind.Workspace,
    extensionPath: 'extensionPath.doNotReadFromHere',
    extensionUri: Uri.file('extensionPath.doNotReadFromHere'),
    id: 'vscode.git',
    packageJSON: {},
    isActive: true,
    exports: gitExports,
}

const _extensions: typeof vscode.extensions = {
    all: [gitExtension],
    onDidChange: emptyEvent(),
    getExtension: (extensionId: string) => {
        if (clientInfo?.capabilities?.git === 'enabled' && extensionId === 'vscode.git') {
            throw new Error(
                'The git extension is not fully implemented. See https://github.com/sourcegraph/cody/issues/4165'
            )
        }

        return undefined
    },
}
export const extensions = _extensions

interface RegisteredCommand {
    command: string
    callback: (...args: any[]) => any
    thisArg?: any
}
const context = new Map<string, any>()
const registeredCommands = new Map<string, RegisteredCommand>()

const _commands: Partial<typeof vscode.commands> = {
    registerCommand: (command: string, callback: (...args: any[]) => any, thisArg?: any) => {
        const value: RegisteredCommand = { command, callback, thisArg }
        registeredCommands.set(command, value)
        return new Disposable(() => {
            const registered = registeredCommands.get(command)
            if (registered === value) {
                registeredCommands.delete(command)
            }
        })
    },
    executeCommand: (command, args) => {
        const registered = registeredCommands.get(command)
        if (registered) {
            try {
                if (args) {
                    if (typeof args === 'object' && typeof args[Symbol.iterator] === 'function') {
                        return promisify(registered.callback(...args))
                    }
                    return promisify(registered.callback(args))
                }
                return promisify(registered.callback())
            } catch (error) {
                console.error(error)
            }
        }

        // We only log a debug warning when unknown commands are invoked because
        // the extension triggers quite a few commands that are not getting activated
        // inside the agent yet.
        logDebug('vscode.commands.executeCommand', 'not found', command)

        return Promise.resolve(undefined)
    },
}

_commands?.registerCommand?.('workbench.action.reloadWindow', () => {
    // Do nothing
})
_commands?.registerCommand?.('setContext', (key, value) => {
    if (typeof key !== 'string') {
        throw new TypeError(`setContext: first argument must be string. Got: ${key}`)
    }
    context.set(key, value)
})
_commands?.registerCommand?.('vscode.executeFoldingRangeProvider', async uri => {
    const promises: vscode.FoldingRange[] = []
    const document = await _workspace.openTextDocument(uri)
    const token = new CancellationTokenSource().token
    for (const provider of foldingRangeProviders) {
        const result = await provider.provideFoldingRanges(document, {}, token)
        if (result) {
            promises.push(...result)
        }
    }
    return promises
})
_commands?.registerCommand?.('vscode.executeDocumentSymbolProvider', uri => {
    // NOTE(olafurpg): unclear yet how important document symbols are. I asked
    // in #wg-cody-vscode for test cases where symbols could influence the
    // behavior of "Document code" and added those test cases to the test suite.
    // Currently, we can reproduce the behavior of Cody in VSC without document
    // symbols. However, the test cases show that we may want to incorporate
    // document symbol data to improve the quality of the inferred selection
    // location.
    return Promise.resolve([])
})
_commands?.registerCommand?.('vscode.executeFormatDocumentProvider', uri => {
    return Promise.resolve([])
})
_commands?.registerCommand?.('vscode.open', async (uri: vscode.Uri) => {
    const result = toUri(uri?.path)
    if (result) {
        return _window.showTextDocument(result)
    }
    return open(uri.toString())
})

function promisify(value: any): Promise<any> {
    return value instanceof Promise ? value : Promise.resolve(value)
}

export const commands = _commands as typeof vscode.commands

const _env: Partial<typeof vscode.env> = {
    uriScheme: 'file',
    appRoot: process.cwd?.(),
    uiKind: UIKind.Web,
    language: process.env.language,
    clipboard: {
        readText: () => Promise.resolve(''),
        writeText: () => Promise.resolve(),
    },
    openExternal: (uri: vscode.Uri): Thenable<boolean> => {
        try {
            open(uri.toString())
            return Promise.resolve(true)
        } catch {
            return Promise.resolve(false)
        }
    },
}
export const env = _env as typeof vscode.env

const newCodeActionProvider = new EventEmitter<vscode.CodeActionProvider>()
const removeCodeActionProvider = new EventEmitter<vscode.CodeActionProvider>()
export const onDidRegisterNewCodeActionProvider = newCodeActionProvider.event
export const onDidUnregisterNewCodeActionProvider = removeCodeActionProvider.event

const newCodeLensProvider = new EventEmitter<vscode.CodeLensProvider>()
const removeCodeLensProvider = new EventEmitter<vscode.CodeLensProvider>()
export const onDidRegisterNewCodeLensProvider = newCodeLensProvider.event
export const onDidUnregisterNewCodeLensProvider = removeCodeLensProvider.event
let latestCompletionProvider: InlineCompletionItemProvider | undefined
let resolveFirstCompletionProvider: (provider: InlineCompletionItemProvider) => void = () => {}
const firstCompletionProvider = new Promise<InlineCompletionItemProvider>(resolve => {
    resolveFirstCompletionProvider = resolve
})
export function completionProvider(): Promise<InlineCompletionItemProvider> {
    if (latestCompletionProvider) {
        return Promise.resolve(latestCompletionProvider)
    }
    return firstCompletionProvider
}

const diagnosticsChange = new EventEmitter<vscode.DiagnosticChangeEvent>()
const onDidChangeDiagnostics = diagnosticsChange.event
const foldingRangeProviders = new Set<vscode.FoldingRangeProvider>()
export const diagnostics = new AgentDiagnostics()
const _languages: Partial<typeof vscode.languages> = {
    getLanguages: () => Promise.resolve([]),
    registerFoldingRangeProvider: (_scope, provider) => {
        foldingRangeProviders.add(provider)
        return { dispose: () => foldingRangeProviders.delete(provider) }
    },
    registerCodeActionsProvider: (_selector, provider) => {
        newCodeActionProvider.fire(provider)
        return { dispose: () => removeCodeActionProvider.fire(provider) }
    },
    registerCodeLensProvider: (_selector, provider) => {
        newCodeLensProvider.fire(provider)
        return { dispose: () => removeCodeLensProvider.fire(provider) }
    },
    registerInlineCompletionItemProvider: (_selector, provider) => {
        latestCompletionProvider = provider as any
        resolveFirstCompletionProvider(provider as any)
        return emptyDisposable
    },
    onDidChangeDiagnostics,
    getDiagnostics: ((resource: vscode.Uri) => {
        if (resource) {
            return diagnostics.forUri(resource)
        }
        return [[resource, []]] // return diagnostics for all resources
    }) as {
        (resource: vscode.Uri): vscode.Diagnostic[]
        (): [vscode.Uri, vscode.Diagnostic[]][]
    },
}

export const languages = _languages as typeof vscode.languages

const commentController: vscode.CommentController = {
    createCommentThread(uri, range, comments) {
        const thread: vscode.CommentThread = {
            canReply: false,
            collapsibleState: CommentThreadCollapsibleState.Expanded,
            comments: [],
            dispose: () => {},
            range: new Range(0, 0, 0, 0),
            uri: Uri.file('commentController.neverReadFromHere'),
        }
        return thread
    },
    id: 'commentController.id',
    label: 'commentController.label',
    dispose: () => {},
}
const _comments: Partial<typeof vscode.comments> = {
    createCommentController: () => commentController,
}
export const comments = _comments as typeof vscode.comments
