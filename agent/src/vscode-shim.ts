/* eslint-disable @typescript-eslint/no-empty-function */
import { execSync } from 'child_process'
import * as fspromises from 'fs/promises'
import path from 'path'

import type * as vscode from 'vscode'

// <VERY IMPORTANT - PLEASE READ>
// This file must not import any module that transitively imports from 'vscode'.
// It's only OK to `import type` from vscode. We can't depend on any vscode APIs
// to implement this this file because this file is responsible for implementing
// VS Code APIs resulting in cyclic dependencies.  If we make a mistake and
// transitively import vscode then you are most likely to hit an error like this:
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
import {
    CancellationTokenSource,
    CommentThreadCollapsibleState,
    // It's OK to import the VS Code mocks because they don't depend on the 'vscode' module.
    Disposable,
    emptyDisposable,
    emptyEvent,
    EventEmitter,
    ExtensionKind,
    FileType,
    LogLevel,
    Range,
    StatusBarAlignment,
    UIKind,
    Uri,
    ViewColumn,
} from '../../vscode/src/testutils/mocks'

import type { Agent } from './agent'
import { AgentTabGroups } from './AgentTabGroups'
import { AgentWorkspaceConfiguration } from './AgentWorkspaceConfiguration'
import { matchesGlobPatterns } from './cli/evaluate-autocomplete/matchesGlobPatterns'
import type { ClientInfo, ExtensionConfiguration } from './protocol-alias'

// Not using CODY_TESTING because it changes the URL endpoint we send requests
// to and we want to send requests to sourcegraph.com because we record the HTTP
// traffic.
const isTesting = process.env.CODY_SHIM_TESTING === 'true'

export {
    emptyEvent,
    emptyDisposable,
    Range,
    Location,
    Selection,
    Position,
    Disposable,
    CancellationTokenSource,
    EndOfLine,
    EventEmitter,
    InlineCompletionItem,
    InlineCompletionTriggerKind,
    WorkspaceEdit,
    QuickPickItemKind,
    ConfigurationTarget,
    StatusBarAlignment,
    RelativePattern,
    MarkdownString,
    ProgressLocation,
    CommentMode,
    CommentThreadCollapsibleState,
    OverviewRulerLane,
    CodeLens,
    CodeAction,
    CodeActionKind,
    FileType,
    ThemeColor,
    ThemeIcon,
    TreeItemCollapsibleState,
    TreeItem,
    ExtensionMode,
    DiagnosticSeverity,
    SymbolKind,
    ViewColumn,
    QuickInputButtons,
    UIKind,
    Uri,
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

export const onDidChangeTextEditorSelection = new EventEmitter<vscode.TextEditorSelectionChangeEvent>()
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
}
let workspaceDocuments: WorkspaceDocuments | undefined
export function setWorkspaceDocuments(newWorkspaceDocuments: WorkspaceDocuments): void {
    workspaceDocuments = newWorkspaceDocuments
    if (newWorkspaceDocuments.workspaceRootUri) {
        workspaceFolders.push({ name: 'Workspace Root', uri: newWorkspaceDocuments.workspaceRootUri, index: 0 })
    }
}

export const workspaceFolders: vscode.WorkspaceFolder[] = []
const fs: typeof vscode.workspace.fs = {
    stat: async uri => {
        const stat = await fspromises.stat(uri.fsPath)
        const type = stat.isFile()
            ? FileType.File
            : stat.isDirectory()
            ? FileType.Directory
            : stat.isSymbolicLink()
            ? FileType.SymbolicLink
            : FileType.Unknown

        return {
            type,
            ctime: stat.ctimeMs,
            mtime: stat.mtimeMs,
            size: stat.size,
        }
    },
    readDirectory: async uri => {
        const entries = await fspromises.readdir(uri.fsPath, { withFileTypes: true })

        return entries.map(entry => {
            const type = entry.isFile()
                ? FileType.File
                : entry.isDirectory()
                ? FileType.Directory
                : entry.isSymbolicLink()
                ? FileType.SymbolicLink
                : FileType.Unknown

            return [entry.name, type]
        })
    },
    createDirectory: async uri => {
        await fspromises.mkdir(uri.fsPath, { recursive: true })
    },
    readFile: async uri => {
        const content = await fspromises.readFile(uri.fsPath)
        return new Uint8Array(content.buffer)
    },
    writeFile: async (uri, content) => {
        await fspromises.writeFile(uri.fsPath, content)
    },
    delete: async (uri, options) => {
        await fspromises.rm(uri.fsPath, { recursive: options?.recursive ?? false })
    },
    rename: async (source, target, options) => {
        if (options?.overwrite ?? false) {
            await fspromises.unlink(target.fsPath)
        }
        await fspromises.link(source.fsPath, target.fsPath)
        await fspromises.unlink(source.fsPath)
    },
    copy: async (source, target, options) => {
        const mode = options?.overwrite ? 0 : fspromises.constants.COPYFILE_EXCL
        await fspromises.copyFile(source.fsPath, target.fsPath, mode)
    },
    isWritableFileSystem: scheme => {
        if (scheme === 'file') {
            return true
        }
        return false
    },
}

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
    applyEdit: () => Promise.resolve(false),
    isTrusted: false,
    name: undefined,
    notebookDocuments: [],
    openNotebookDocument: (() => {}) as any,
    registerFileSystemProvider: () => emptyDisposable,
    registerNotebookSerializer: () => emptyDisposable,
    saveAll: () => Promise.resolve(false),
    textDocuments: [],
    updateWorkspaceFolders: () => false,
    workspaceFile: undefined,
    registerTaskProvider: () => emptyDisposable,
    async findFiles(include, exclude, maxResults, token) {
        if (typeof include !== 'string') {
            throw new TypeError('workspaces.findFiles: include must be a string')
        }
        if (exclude !== undefined && typeof exclude !== 'string') {
            throw new TypeError('workspaces.findFiles: exclude must be a string')
        }

        const result: vscode.Uri[] = []
        const loop = async (workspaceRoot: vscode.Uri, dir: vscode.Uri): Promise<void> => {
            if (token?.isCancellationRequested) {
                return
            }
            const files = await fs.readDirectory(dir)
            for (const [name, fileType] of files) {
                const uri = Uri.file(path.join(dir.fsPath, name))
                const relativePath = path.relative(workspaceRoot.fsPath, uri.fsPath)
                if (fileType.valueOf() === FileType.Directory.valueOf()) {
                    await loop(workspaceRoot, uri)
                } else if (fileType.valueOf() === FileType.File.valueOf()) {
                    if (!matchesGlobPatterns(include ? [include] : [], exclude ? [exclude] : [], relativePath)) {
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
            workspaceFolders.map(async folder => {
                try {
                    const stat = await fs.stat(folder.uri)
                    if (stat.type.valueOf() === FileType.Directory.valueOf()) {
                        await loop(folder.uri, folder.uri)
                    }
                } catch (error) {
                    console.error(`workspace.workspace.finFiles: failed to stat workspace folder ${folder.uri}`, error)
                    // ignore invalid workspace folders
                }
            })
        )
        return result
    },
    openTextDocument: uriOrString => {
        if (!workspaceDocuments) {
            return Promise.reject(new Error('workspaceDocuments is uninitialized'))
        }
        if (typeof uriOrString === 'string') {
            return workspaceDocuments.openTextDocument(Uri.file(uriOrString))
        }
        if (uriOrString instanceof Uri) {
            return workspaceDocuments.openTextDocument(uriOrString)
        }
        return Promise.reject(
            new Error(`workspace.openTextDocument:unsupported argument ${JSON.stringify(uriOrString)}`)
        )
    },
    workspaceFolders,
    getWorkspaceFolder: () => {
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
    onDidChangeWorkspaceFolders: emptyEvent(),
    onDidOpenTextDocument: onDidOpenTextDocument.event,
    onDidChangeConfiguration: onDidChangeConfiguration.event,
    onDidChangeTextDocument: onDidChangeTextDocument.event,
    onDidCloseTextDocument: onDidCloseTextDocument.event,
    onDidSaveTextDocument: onDidSaveTextDocument.event,
    onDidRenameFiles: onDidRenameFiles.event,
    onDidDeleteFiles: onDidDeleteFiles.event,
    registerTextDocumentContentProvider: () => emptyDisposable,
    asRelativePath: (pathOrUri: string | vscode.Uri): string => {
        const uri: vscode.Uri | undefined =
            typeof pathOrUri === 'string' ? Uri.file(pathOrUri) : pathOrUri instanceof Uri ? pathOrUri : undefined
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
    createFileSystemWatcher: () => emptyFileWatcher,
    getConfiguration: section => {
        if (section) {
            return configuration.withPrefix(section)
        }
        return configuration
    },
    fs,
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
    showOptions: vscode.ViewColumn | { readonly viewColumn: vscode.ViewColumn; readonly preserveFocus?: boolean }
    options: (vscode.WebviewPanelOptions & vscode.WebviewOptions) | undefined
    onDidReceiveMessage: vscode.EventEmitter<any>
    onDidPostMessage: EventEmitter<any>
}): vscode.WebviewPanel {
    return {
        active: false,
        dispose: () => {},
        onDidChangeViewState: emptyEvent(),
        onDidDispose: emptyEvent(),
        options: params.options ?? { enableFindWidget: false, retainContextWhenHidden: false },
        reveal: () => {},
        title: params.title,
        viewColumn: typeof params.showOptions === 'number' ? params.showOptions : params.showOptions.viewColumn,
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

export function setCreateWebviewPanel(newCreateWebviewPanel: typeof vscode.window.createWebviewPanel): void {
    shimmedCreateWebviewPanel = newCreateWebviewPanel
}

const _window: Partial<typeof vscode.window> = {
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
    registerWebviewViewProvider: () => emptyDisposable,
    createStatusBarItem: () => statusBarItem,
    visibleTextEditors,
    withProgress: (_, handler) => handler({ report: () => {} }, new CancellationTokenSource().token),
    onDidChangeActiveTextEditor: onDidChangeActiveTextEditor.event,
    onDidChangeVisibleTextEditors: onDidChangeVisibleTextEditors.event,
    onDidChangeTextEditorSelection: onDidChangeTextEditorSelection.event,
    showErrorMessage: (message: string, ...items: any[]) => {
        if (agent) {
            agent.notify('debug/message', { channel: 'window.showErrorMessage', message })
        }
        return Promise.resolve(undefined)
    },
    showWarningMessage: (message: string, ...items: any[]) => {
        if (agent) {
            agent.notify('debug/message', { channel: 'window.showWarningMessage', message })
        }
        return Promise.resolve(undefined)
    },
    showInformationMessage: (message: string, ...items: any[]) => {
        if (agent) {
            agent.notify('debug/message', { channel: 'window.showInformationMessage', message })
        }
        return Promise.resolve(undefined)
    },
    createOutputChannel: (name: string) => outputChannel(name),
    createTextEditorDecorationType: () => ({ key: 'foo', dispose: () => {} }),
}

export const window = _window as typeof vscode.window
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
                    const toplevel = execSync('git rev-parse --show-toplevel', { cwd }).toString().trim()
                    if (toplevel !== uri.fsPath) {
                        return null
                    }
                    const commit = execSync('git rev-parse --abbrev-ref HEAD', { cwd }).toString().trim()
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
        const shouldActivateGitExtension = clientInfo !== undefined && clientInfo?.capabilities?.git !== 'disabled'
        if (shouldActivateGitExtension && extensionId === 'vscode.git') {
            const extension: vscode.Extension<any> = gitExtension
            return extension
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
                    return promisify(registered.callback(...args))
                }
                return promisify(registered.callback())
            } catch (error) {
                console.error(error)
            }
        }

        return Promise.resolve(undefined)
    },
}

function promisify(value: any): Promise<any> {
    return value instanceof Promise ? value : Promise.resolve(value)
}

export const commands = _commands as typeof vscode.commands

const _env: Partial<typeof vscode.env> = {
    uriScheme: 'file',
    appRoot: process.cwd(),
    uiKind: UIKind.Web,
    language: process.env.language,
    clipboard: {
        readText: () => Promise.resolve(''),
        writeText: () => Promise.resolve(),
    },
}
export const env = _env as typeof vscode.env

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

const _languages: Partial<typeof vscode.languages> = {
    getLanguages: () => Promise.resolve([]),
    registerCodeActionsProvider: () => emptyDisposable,
    registerCodeLensProvider: () => emptyDisposable,
    registerInlineCompletionItemProvider: (_selector, provider) => {
        latestCompletionProvider = provider as any
        resolveFirstCompletionProvider(provider as any)
        return emptyDisposable
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
