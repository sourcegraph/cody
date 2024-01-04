/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/explicit-member-accessibility */
/* eslint-disable import/no-duplicates */
/* eslint-disable @typescript-eslint/no-empty-function */
// TODO: use implements vscode.XXX on mocked classes to ensure they match the real vscode API.
import fs from 'fs/promises'

import type {
    Disposable as VSCodeDisposable,
    InlineCompletionTriggerKind as VSCodeInlineCompletionTriggerKind,
    Location as VSCodeLocation,
    Position as VSCodePosition,
    Range as VSCodeRange,
} from 'vscode'
import type * as vscode_types from 'vscode'

import { Configuration } from '@sourcegraph/cody-shared/src/configuration'
import { FeatureFlag, FeatureFlagProvider } from '@sourcegraph/cody-shared/src/experimentation/FeatureFlagProvider'

import { Uri } from './uri'

export { Uri } from './uri'

export class Disposable implements VSCodeDisposable {
    public static from(...disposableLikes: { dispose: () => any }[]): Disposable {
        return new Disposable(() => {
            for (const disposable of disposableLikes) {
                disposable.dispose()
            }
        })
    }
    constructor(private readonly callOnDispose: () => any) {}
    public dispose(): void {
        this.callOnDispose()
    }
}

/**
 * This module defines shared VSCode mocks for use in every Vitest test.
 * Tests requiring no custom mocks will automatically apply the mocks defined in this file.
 * This is made possible via the `setupFiles` property in the Vitest configuration.
 */

export enum InlineCompletionTriggerKind {
    Invoke = 0 satisfies VSCodeInlineCompletionTriggerKind.Invoke,
    Automatic = 1 satisfies VSCodeInlineCompletionTriggerKind.Automatic,
}

export enum QuickPickItemKind {
    Separator = -1,
    Default = 0,
}

export enum ConfigurationTarget {
    Global = 1,
    Workspace = 2,
    WorkspaceFolder = 3,
}

export enum StatusBarAlignment {
    Left = 1,
    Right = 2,
}

export enum LogLevel {
    Off = 0,
    Trace = 1,
    Debug = 2,
    Info = 3,
    Warning = 4,
    Error = 5,
}
export enum ExtensionKind {
    UI = 1,
    Workspace = 2,
}

export enum CommentThreadCollapsibleState {
    Collapsed = 0,
    Expanded = 1,
}

export enum OverviewRulerLane {
    Left = 1,
    Center = 2,
    Right = 4,
    Full = 7,
}

export class CodeLens {
    public readonly isResolved = true
    constructor(
        public readonly range: Range,
        public readonly command?: vscode_types.Command
    ) {}
}
export class ThemeColor {
    constructor(public readonly id: string) {}
}

export class ThemeIcon {
    static readonly File = new ThemeIcon('file')
    static readonly Folder = new ThemeIcon('folder')
    constructor(
        public readonly id: string,
        public readonly color?: ThemeColor
    ) {}
}

export class MarkdownString implements vscode_types.MarkdownString {
    constructor(public readonly value: string) {}
    isTrusted?: boolean | { readonly enabledCommands: readonly string[] } | undefined
    supportThemeIcons?: boolean | undefined
    supportHtml?: boolean | undefined
    baseUri?: vscode_types.Uri | undefined
    appendText(): vscode_types.MarkdownString {
        throw new Error('Method not implemented.')
    }
    appendMarkdown(): vscode_types.MarkdownString {
        throw new Error('Method not implemented.')
    }
    appendCodeblock(): vscode_types.MarkdownString {
        throw new Error('Method not implemented.')
    }
}

export enum CommentMode {
    Editing = 0,
    Preview = 1,
}

export enum TreeItemCollapsibleState {
    None = 0,
    Collapsed = 1,
    Expanded = 2,
}
export enum ExtensionMode {
    Production = 1,
    Development = 2,
    Test = 3,
}
export enum DiagnosticSeverity {
    Error = 0,
    Warning = 1,
    Information = 2,
    Hint = 3,
}
export enum SymbolKind {
    File = 0,
    Module = 1,
    Namespace = 2,
    Package = 3,
    Class = 4,
    Method = 5,
    Property = 6,
    Field = 7,
    Constructor = 8,
    Enum = 9,
    Interface = 10,
    Function = 11,
    Variable = 12,
    Constant = 13,
    String = 14,
    Number = 15,
    Boolean = 16,
    Array = 17,
    Object = 18,
    Key = 19,
    Null = 20,
    EnumMember = 21,
    Struct = 22,
    Event = 23,
    Operator = 24,
    TypeParameter = 25,
}
export enum ViewColumn {
    Active = -1,
    Beside = -2,
    One = 1,
    Two = 2,
    Three = 3,
    Four = 4,
    Five = 5,
    Six = 6,
    Seven = 7,
    Eight = 8,
    Nine = 9,
}
export class CodeAction {
    edit?: WorkspaceEdit
    diagnostics?: vscode_types.Diagnostic[]
    command?: vscode_types.Command
    isPreferred?: boolean
    disabled?: {
        readonly reason: string
    }
    constructor(
        public readonly title: string,
        public readonly kind?: vscode_types.CodeActionKind
    ) {}
}
export class CodeActionKind {
    static readonly Empty = new CodeActionKind('Empty')
    static readonly QuickFix = new CodeActionKind('')
    static readonly Refactor = new CodeActionKind('')
    static readonly RefactorExtract = new CodeActionKind('')
    static readonly RefactorInline = new CodeActionKind('')
    static readonly RefactorMove = new CodeActionKind('')
    static readonly RefactorRewrite = new CodeActionKind('')
    static readonly Source = new CodeActionKind('')
    static readonly SourceOrganizeImports = new CodeActionKind('')

    static readonly SourceFixAll = new CodeActionKind('')

    constructor(public readonly value: string) {}
}

// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class QuickInputButtons {
    public static readonly Back: vscode_types.QuickInputButton = { iconPath: Uri.parse('file://foobar') }
}

export class TreeItem {
    constructor(
        public readonly resourceUri: vscode_types.Uri,
        public readonly collapsibleState?: TreeItemCollapsibleState
    ) {}
}

export class RelativePattern implements vscode_types.RelativePattern {
    public baseUri = Uri.parse('file:///foobar')
    public base: string
    constructor(
        _base: vscode_types.WorkspaceFolder | vscode_types.Uri | string,
        public readonly pattern: string
    ) {
        // eslint-disable-next-line @typescript-eslint/no-base-to-string
        this.base = _base.toString()
    }
}

export class Position implements VSCodePosition {
    public line: number
    public character: number

    constructor(line: number, character: number) {
        this.line = line
        this.character = character
    }

    public isAfter(other: Position): boolean {
        return other.line < this.line || (other.line === this.line && other.character < this.character)
    }
    public isAfterOrEqual(other: Position): boolean {
        return this.isAfter(other) || this.isEqual(other)
    }
    public isBefore(other: Position): boolean {
        return !this.isAfterOrEqual(other)
    }
    public isBeforeOrEqual(other: Position): boolean {
        return !this.isAfter(other)
    }
    public isEqual(other: Position): boolean {
        return this.line === other.line && this.character === other.character
    }
    public translate(change: { lineDelta?: number; characterDelta?: number }): VSCodePosition
    public translate(lineDelta?: number, characterDelta?: number): VSCodePosition
    public translate(
        arg?: number | { lineDelta?: number; characterDelta?: number },
        characterDelta?: number
    ): VSCodePosition {
        const lineDelta = typeof arg === 'number' ? arg : arg?.lineDelta
        characterDelta = arg && typeof arg !== 'number' ? arg.characterDelta : characterDelta
        return new Position(this.line + (lineDelta || 0), this.character + (characterDelta || 0))
    }

    public with(line?: number, character?: number): VSCodePosition
    public with(change: { line?: number; character?: number }): VSCodePosition
    public with(arg?: number | { line?: number; character?: number }, character?: number): VSCodePosition {
        const line = typeof arg === 'number' ? arg : arg?.line
        character = arg && typeof arg !== 'number' ? arg.character : character
        return new Position(this.line + (line || 0), this.character + (character || 0))
    }

    public compareTo(other: VSCodePosition): number {
        return this.isBefore(other) ? -1 : this.isAfter(other) ? 1 : 0
    }
}

export class Location implements VSCodeLocation {
    public range: VSCodeRange

    constructor(
        public readonly uri: vscode_types.Uri,
        rangeOrPosition: VSCodeRange | VSCodePosition
    ) {
        if ('line' in rangeOrPosition && 'character' in rangeOrPosition) {
            this.range = new Range(rangeOrPosition, rangeOrPosition)
        } else {
            this.range = rangeOrPosition
        }
    }
}

export class Range implements VSCodeRange {
    public start: Position
    public end: Position

    constructor(
        startLine: number | Position,
        startCharacter: number | Position,
        endLine?: number,
        endCharacter?: number
    ) {
        if (typeof startLine !== 'number' && typeof startCharacter !== 'number') {
            this.start = startLine
            this.end = startCharacter
        } else if (
            typeof startLine === 'number' &&
            typeof startCharacter === 'number' &&
            typeof endLine === 'number' &&
            typeof endCharacter === 'number'
        ) {
            this.start = new Position(startLine, startCharacter)
            this.end = new Position(endLine, endCharacter)
        } else {
            throw new TypeError('this version of the constructor is not implemented')
        }
    }

    public with(start?: VSCodePosition, end?: VSCodePosition): VSCodeRange
    public with(change: { start?: VSCodePosition; end?: VSCodePosition }): VSCodeRange
    public with(
        arg?: VSCodePosition | { start?: VSCodePosition; end?: VSCodePosition },
        end?: VSCodePosition
    ): VSCodeRange {
        const start = arg && ('start' in arg || 'end' in arg) ? arg.start : (arg as VSCodePosition)
        end = arg && 'end' in arg ? arg.end : end
        return new Range(start || this.start, end || this.end)
    }
    public get startLine(): number {
        return this.start.line
    }
    public get startCharacter(): number {
        return this.start.character
    }
    public get endLine(): number {
        return this.end.line
    }
    public get endCharacter(): number {
        return this.end.character
    }
    public isEqual(other: VSCodeRange): boolean {
        return this.start.isEqual(other.start) && this.end.isEqual(other.end)
    }
    public get isEmpty(): boolean {
        return this.start.isEqual(this.end)
    }
    public get isSingleLine(): boolean {
        return this.start.line === this.end.line
    }
    public contains(positionOrRange: Position | Range): boolean {
        if ('line' in positionOrRange) {
            return (
                positionOrRange.line >= this.start.line &&
                positionOrRange.line <= this.end.line &&
                positionOrRange.character >= this.start.character &&
                positionOrRange.character <= this.end.character
            )
        }

        throw new Error('not implemented')
    }
    public intersection(): VSCodeRange | undefined {
        throw new Error('not implemented')
    }
    public union(): VSCodeRange {
        throw new Error('not implemented')
    }
}

export class Selection extends Range {
    constructor(
        public readonly anchor: Position,
        public readonly active: Position
    ) {
        super(anchor, active)
    }

    /**
     * Create a selection from four coordinates.
     * @param anchorLine A zero-based line value.
     * @param anchorCharacter A zero-based character value.
     * @param activeLine A zero-based line value.
     * @param activeCharacter A zero-based character value.
     */
    // constructor(anchorLine: number, anchorCharacter: number, activeLine: number, activeCharacter: number) {}

    /**
     * A selection is reversed if its {@link Selection.anchor anchor} is the {@link Selection.end end} position.
     */
    isReversed = false
}

export enum FoldingRangeKind {
    Comment = 1,
    Imports = 2,
    Region = 3,
}

export class FoldingRange {
    constructor(
        public start: number,
        public end: number,
        public kind?: FoldingRangeKind
    ) {}
}

export class InlineCompletionItem {
    public insertText: string
    public range: Range | undefined
    constructor(content: string, range?: Range) {
        this.insertText = content
        this.range = range
    }
}

// TODO(abeatrix): Implement delete and insert mocks
export class WorkspaceEdit {
    public delete(uri: vscode_types.Uri, range: Range): Range {
        return range
    }
    public insert(uri: vscode_types.Uri, position: Position, content: string): string {
        return content
    }
}

interface Callback {
    handler: (arg?: any) => any
    thisArg?: any
}
function invokeCallback(callback: Callback, arg?: any): any {
    return callback.thisArg ? callback.handler.bind(callback.thisArg)(arg) : callback.handler(arg)
}
export const emptyDisposable = new Disposable(() => {})

export class EventEmitter<T> implements vscode_types.EventEmitter<T> {
    public on = (): undefined => undefined

    constructor() {
        this.on = () => undefined
    }

    private readonly listeners = new Set<Callback>()
    event: vscode_types.Event<T> = (listener, thisArgs) => {
        const value: Callback = { handler: listener, thisArg: thisArgs }
        this.listeners.add(value)
        return new Disposable(() => {
            this.listeners.delete(value)
        })
    }

    fire(data: T): void {
        for (const listener of this.listeners) {
            invokeCallback(listener, data)
        }
    }

    /**
     * Custom extension of the VS Code API to make it possible to `await` on the
     * result of `EventEmitter.fire()`.  Most event listeners return a
     * meaningful `Promise` that is discarded in the signature of the `fire()`
     * function.  Being able to await on returned promise makes it possible to
     * write more robust tests because we don't need to rely on magic timeouts.
     */
    public async cody_fireAsync(data: T): Promise<void> {
        const promises: Promise<void>[] = []
        for (const listener of this.listeners) {
            const value = invokeCallback(listener, data)
            promises.push(Promise.resolve(value))
        }
        await Promise.all(promises)
    }

    dispose(): void {
        this.listeners.clear()
    }
}

export enum EndOfLine {
    LF = 1,
    CRLF = 2,
}

export enum FileType {
    Unknown = 0,
    File = 1,
    Directory = 2,
    SymbolicLink = 64,
}

export class CancellationToken implements vscode_types.CancellationToken {
    public isCancellationRequested = false
    public emitter = new EventEmitter<void>()
    constructor() {
        this.emitter.event(() => {
            this.isCancellationRequested = true
        })
    }
    onCancellationRequested = this.emitter.event
}
export class CancellationTokenSource implements vscode_types.CancellationTokenSource {
    public token = new CancellationToken()
    cancel(): void {
        if (!this.token.isCancellationRequested) {
            this.token.emitter.fire()
        }
    }
    dispose(): void {
        this.token.emitter.dispose()
    }
}

const workspaceFs: Partial<vscode_types.FileSystem> = {
    async stat(uri) {
        const stat = await fs.stat(uri.fsPath)

        return {
            ...stat,
            type: FileType.File,
            ctime: stat.ctime.getTime(),
            mtime: stat.mtime.getTime(),
        } as vscode_types.FileStat
    },
    async readDirectory(uri) {
        const entries = await fs.readdir(uri.fsPath, { withFileTypes: true })

        return entries.map(entry => {
            const type = entry.isFile()
                ? FileType.File
                : entry.isSymbolicLink()
                ? FileType.SymbolicLink
                : entry.isDirectory()
                ? FileType.Directory
                : FileType.Unknown

            return [entry.name, type]
        })
    },
    readFile(uri) {
        return fs.readFile(uri.fsPath)
    },
}

const languages: Partial<typeof vscode_types.languages> = {
    // Copied from the `console.log(vscode.languages.getLanguages())` output.
    getLanguages() {
        return Promise.resolve([
            'plaintext',
            'code-text-binary',
            'Log',
            'log',
            'scminput',
            'bat',
            'clojure',
            'coffeescript',
            'jsonc',
            'json',
            'c',
            'cpp',
            'cuda-cpp',
            'csharp',
            'css',
            'dart',
            'diff',
            'dockerfile',
            'ignore',
            'fsharp',
            'git-commit',
            'git-rebase',
            'go',
            'groovy',
            'handlebars',
            'hlsl',
            'html',
            'ini',
            'properties',
            'java',
            'javascriptreact',
            'javascript',
            'jsx-tags',
            'jsonl',
            'snippets',
            'julia',
            'juliamarkdown',
            'tex',
            'latex',
            'bibtex',
            'cpp_embedded_latex',
            'markdown_latex_combined',
            'less',
            'lua',
            'makefile',
            'markdown',
            'markdown-math',
            'wat',
            'objective-c',
            'objective-cpp',
            'perl',
            'perl6',
            'php',
            'powershell',
            'jade',
            'python',
            'r',
            'razor',
            'restructuredtext',
            'ruby',
            'rust',
            'scss',
            'search-result',
            'shaderlab',
            'shellscript',
            'sql',
            'swift',
            'typescript',
            'typescriptreact',
            'vb',
            'xml',
            'xsl',
            'dockercompose',
            'yaml',
            'tailwindcss',
            'editorconfig',
            'graphql',
            'vue',
            'go.mod',
            'go.work',
            'go.sum',
            'gotmpl',
            'govulncheck',
            'kotlin',
            'kotlinscript',
            'lisp',
            'toml',
            'jinja',
            'pip-requirements',
            'raw',
            'prisma',
            'starlark',
            'bazel',
            'bazelrc',
            'vimrc',
        ])
    },
}

export enum UIKind {
    Desktop = 1,
    Web = 2,
}

export const vsCodeMocks = {
    Range,
    Position,
    InlineCompletionItem,
    EventEmitter,
    EndOfLine,
    CancellationTokenSource,
    ThemeColor,
    ThemeIcon,
    TreeItem,
    WorkspaceEdit,
    UIKind,
    Uri,
    languages,
    window: {
        showInformationMessage: () => undefined,
        showWarningMessage: () => undefined,
        showQuickPick: () => undefined,
        showInputBox: () => undefined,
        createOutputChannel() {
            return null
        },
        showErrorMessage(message: string) {
            console.error(message)
        },
        activeTextEditor: { document: { uri: { scheme: 'not-cody' } }, options: { tabSize: 4 } },
        onDidChangeActiveTextEditor() {},
        createTextEditorDecorationType: () => ({ key: 'foo', dispose: () => {} }),
    },
    commands: {
        registerCommand: () => ({ dispose: () => {} }),
    },
    workspace: {
        fs: workspaceFs,
        getConfiguration() {
            return {
                get(key: string) {
                    switch (key) {
                        case 'cody.debug.filter':
                            return '.*'
                        default:
                            return ''
                    }
                },
                update(): void {},
            }
        },
        openTextDocument: (uri: string) => ({
            getText: () => 'foo\nbar\nfoo',
            save: () => true,
        }),
        applyEdit: (edit: WorkspaceEdit) => true,
        save: () => true,
        asRelativePath(path: string | vscode_types.Uri) {
            return path.toString()
        },
        onDidChangeTextDocument() {},
        onDidRenameFiles() {},
        onDidDeleteFiles() {},
    },
    ConfigurationTarget: {
        Global: undefined,
    },
    extensions: {
        getExtension() {
            return undefined
        },
    },
    InlineCompletionTriggerKind,
    SymbolKind,
    FoldingRange,
    FoldingRangeKind,
    CodeActionKind,
    DiagnosticSeverity,
} as const

export function emptyEvent<T>(): vscode_types.Event<T> {
    return () => emptyDisposable
}

export enum ProgressLocation {
    SourceControl = 1,
    Window = 10,
    Notification = 15,
}

export class MockFeatureFlagProvider extends FeatureFlagProvider {
    constructor(private readonly enabledFlags: Set<FeatureFlag>) {
        super(null as any)
    }

    public evaluateFeatureFlag(flag: FeatureFlag): Promise<boolean> {
        return Promise.resolve(this.enabledFlags.has(flag))
    }
    public syncAuthStatus(): void {
        return
    }
}

export const emptyMockFeatureFlagProvider = new MockFeatureFlagProvider(new Set<FeatureFlag>())
export const decGaMockFeatureFlagProvider = new MockFeatureFlagProvider(new Set<FeatureFlag>([FeatureFlag.CodyPro]))

export const DEFAULT_VSCODE_SETTINGS = {
    proxy: null,
    codebase: '',
    customHeaders: {},
    chatPreInstruction: '',
    useContext: 'embeddings',
    autocomplete: true,
    autocompleteLanguages: {
        '*': true,
    },
    commandCodeLenses: false,
    editorTitleCommandIcon: true,
    experimentalChatPredictions: false,
    experimentalGuardrails: false,
    experimentalLocalSymbols: false,
    experimentalSimpleChatContext: true,
    experimentalSymfContext: false,
    experimentalTracing: false,
    codeActions: true,
    isRunningInsideAgent: false,
    agentIDE: undefined,
    debugEnable: false,
    debugVerbose: false,
    debugFilter: null,
    telemetryLevel: 'all',
    internalUnstable: false,
    autocompleteAdvancedProvider: null,
    autocompleteAdvancedModel: null,
    autocompleteCompleteSuggestWidgetSelection: true,
    autocompleteFormatOnAccept: true,
    autocompleteExperimentalSyntacticPostProcessing: true,
    autocompleteExperimentalDynamicMultilineCompletions: false,
    autocompleteExperimentalHotStreak: false,
    autocompleteExperimentalGraphContext: null,
    autocompleteTimeouts: {},
    testingLocalEmbeddingsEndpoint: undefined,
    testingLocalEmbeddingsIndexLibraryPath: undefined,
    testingLocalEmbeddingsModel: undefined,
} satisfies Configuration
