import * as vscode from 'vscode'

import { InlineCompletionItemProvider } from '../../vscode/src/completions/vscodeInlineCompletionItemProvider'
import { Disposable, UIKind } from '../../vscode/src/testutils/mocks'

import { ConnectionConfiguration } from './protocol'

export {
    Range,
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
    Uri,
    UIKind,
} from '../../vscode/src/testutils/mocks'

export const emptyDisposable = new Disposable(() => {})
export function emptyEvent<T>(): vscode.Event<T> {
    return () => emptyDisposable
}

const emptyFileWatcher: vscode.FileSystemWatcher = {
    onDidChange: emptyEvent(),
    onDidCreate: emptyEvent(),
    onDidDelete: emptyEvent(),
    ignoreChangeEvents: true,
    ignoreCreateEvents: true,
    ignoreDeleteEvents: true,
    dispose() {},
}

export let connectionConfig: ConnectionConfiguration | undefined
export function setConnectionConfig(newConfig: ConnectionConfiguration): void {
    connectionConfig = newConfig
}

const configuration: vscode.WorkspaceConfiguration = {
    has(section) {
        return true
    },
    get: (section, defaultValue?: any) => {
        switch (section) {
            case 'cody.serverEndpoint':
                return connectionConfig?.serverEndpoint
            case 'cody.customHeaders':
                return connectionConfig?.customHeaders
            case 'cody.autocomplete.enabled':
                return true
            default:
                // console.log({ section })
                return defaultValue
        }
    },
    update(section, value, configurationTarget, overrideInLanguage) {
        return Promise.resolve()
    },
    inspect(section) {
        return undefined
    },
}
const _workspace: Partial<typeof vscode.workspace> = {
    onDidChangeWorkspaceFolders: (() => ({})) as any,
    onDidChangeConfiguration: (() => ({})) as any,
    onDidChangeTextDocument: (() => ({})) as any,
    onDidCloseTextDocument: (() => ({})) as any,
    onDidRenameFiles: (() => ({})) as any,
    onDidDeleteFiles: (() => ({})) as any,
    registerTextDocumentContentProvider: () => emptyDisposable,
    asRelativePath: (pathOrUri: string | vscode.Uri, includeWorkspaceFolder?: boolean): string => {
        return pathOrUri.toString()
    },
    createFileSystemWatcher: () => emptyFileWatcher,
    getConfiguration: (() => configuration) as any,
}
export const workspace = _workspace as typeof vscode.workspace

const statusBarItem: Partial<vscode.StatusBarItem> = {
    show: () => {},
}
const _window: Partial<typeof vscode.window> = {
    tabGroups: {
        all: [],
        activeTabGroup: { isActive: false, activeTab: undefined, tabs: [], viewColumn: vscode.ViewColumn.Active },
        close: () => Promise.resolve(false),
        onDidChangeTabGroups: emptyEvent(),
        onDidChangeTabs: emptyEvent(),
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
    createStatusBarItem: (() => statusBarItem) as any,
    visibleTextEditors: [],
    onDidChangeActiveTextEditor: emptyEvent(),
    onDidChangeVisibleTextEditors: (() => ({})) as any,
    onDidChangeTextEditorSelection: (() => ({})) as any,
    showErrorMessage: ((message: string, ...items: string[]) => {}) as any,
    showWarningMessage: ((message: string, ...items: string[]) => {}) as any,
    showInformationMessage: ((message: string, ...items: string[]) => {}) as any,
    createOutputChannel: ((name: string) =>
        ({
            name,
            append: () => {},
            appendLine: () => {},
            replace: () => {},
            clear: () => {},
            show: () => {},
            hide: () => {},
            dispose: () => {},
        }) as vscode.OutputChannel) as any,
    createTextEditorDecorationType: () => ({ key: 'foo', dispose: () => {} }),
}

export const window = _window as typeof vscode.window

const _extensions: Partial<typeof vscode.extensions> = {
    getExtension: (extensionId: string) => undefined,
}
export const extensions = _extensions as typeof vscode.extensions

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
                if (args) return registered.callback(...args)
                else return registered.callback()
            } catch (error) {
                console.error(error)
            }
        }
    },
}
export const commands = _commands as typeof vscode.commands

const _env: Partial<typeof vscode.env> = {
    uriScheme: 'file',
    appRoot: process.cwd(),
    uiKind: UIKind.Desktop,
}
export const env = _env as typeof vscode.env

let resolveCompletionProvider: (provider: InlineCompletionItemProvider) => void = () => {}
export let completionProvider: Promise<InlineCompletionItemProvider> = new Promise(resolve => {
    resolveCompletionProvider = resolve
})

const _languages: Partial<typeof vscode.languages> = {
    registerCodeActionsProvider: () => emptyDisposable,
    registerCodeLensProvider: () => emptyDisposable,
    registerInlineCompletionItemProvider: (selector, provider) => {
        console.error('PROVIDER!!')
        resolveCompletionProvider(provider as any)
        completionProvider = Promise.resolve(provider as any)
        return emptyDisposable
    },
}
export const languages = _languages as typeof vscode.languages

const commentController: vscode.CommentController = {
    createCommentThread(uri, range, comments) {
        return 'createCommentThread' as any
    },
    id: 'commentController.id',
    label: 'commentController.label',
    dispose() {},
}
const _comments: Partial<typeof vscode.comments> = {
    createCommentController: () => commentController,
}
export const comments = _comments as typeof vscode.comments
