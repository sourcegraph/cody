import {
    type AutocompleteContextSnippet,
    type FileURI,
    defaultPathFunctions,
    isFileURI,
    isMacOS,
    isWindows,
    logDebug,
    logError,
    nextTick,
    tracer,
} from '@sourcegraph/cody-shared'
import ts from 'typescript'
import * as vscode from 'vscode'
import type {
    ProtocolDiagnostic,
    ProtocolRelatedInformationDiagnostic,
} from '../../../../jsonrpc/agent-protocol'
import type { ContextRetriever, ContextRetrieverOptions } from '../../../types'
import { SymbolFormatter, isStdLibNode } from './SymbolFormatter'
import { getTSSymbolAtLocation } from './getTSSymbolAtLocation'
import { type NodeMatchKind, relevantTypeIdentifiers } from './relevantTypeIdentifiers'
import { supportedTscLanguages } from './supportedTscLanguages'

interface LoadedCompiler {
    service: ts.LanguageService
    program: ts.Program
    checker: ts.TypeChecker
    sourceFile: ts.SourceFile
}

const path = defaultPathFunctions()

interface TscRetrieverOptions {
    /**
     * If true, we include symbols that are already defined in the open file.
     * If false (default), we exclude symbols if they are already present in the
     * current file. We default to false because it's redundant to include context
     * that is already present in the file.
     */
    includeSymbolsInCurrentFile: boolean

    /**
     * The "node match" counter increases for every language construct that
     * we've detected as relevant for the requets location. Examples that
     * increment the node match count (even if those matches emit multiple
     * symbols):
     *
     * - All symbols related to `qualifier` in the pattern `qualifier.CURSOR`.
     * - All symbols related to function declaration parameters and return type.
     * - All toplevel imports of a source file
     */
    maxNodeMatches: number

    /**
     * For each node match, include at most these number of matches.
     */
    maxSnippetsPerNodeMatch: Map<NodeMatchKind, number>

    /** For node match kinds that are undefined in maxSnippetsPerNodeMatch, use this value. */
    defaultSnippetsPerNodeMatch: number

    /** Return at most this number of total symbol snippets per request.  */
    maxTotalSnippets: number

    /**
     * The "symbol depth" determines how many nested ljyers of signatures we
     * want to emit for a given symbol. For example,
     *
     * - Depth 0: does nothing
     * - Depth 1: emit the signature of the symbols that are referenced in the
     *   open source file. For example, if you reference `Animal` as a parameter type
     *   then we include the definition of `Animal` in the context.
     * - Depth 2: same as depth 1 except we also expand the types of symbols that are
     *   referenced inside the `Animal` type.
     *
     * Recursively expanding all referenced types quickly goes out of hand.
     * However, we leave out a lot of important information by having depth=1.
     * Ideally, we can use depth=2 combined with some smart local ranking to
     * eliminate potential noise.
     */
    maxSymbolDepth: number
}

export function defaultTscRetrieverOptions(): TscRetrieverOptions {
    return {
        // it's confusing when we skip results from the local file. Also, the
        // prefix/suffix are often only a fraction of the open file anyways.
        includeSymbolsInCurrentFile: true,
        maxNodeMatches: vscode.workspace
            .getConfiguration('sourcegraph')
            .get<number>('cody.autocomplete.experimental.maxTscResults', 1),
        maxSnippetsPerNodeMatch: new Map([['imports', 3]]),
        defaultSnippetsPerNodeMatch: 5,
        maxTotalSnippets: 10,
        maxSymbolDepth: 1,
    }
}

interface TscLanguageService {
    service: ts.LanguageService
    host: TscLanguageServiceHost
}

interface DocumentSnapshot {
    text: string
    version: string
}

/**
 * The tsc retriever uses the TypeScript compiler API to retrieve contextual
 * information about the autocomplete request location.
 */
export class TscRetriever implements ContextRetriever {
    public identifier = 'tsc'

    constructor(private options: TscRetrieverOptions = defaultTscRetrieverOptions()) {
        this.disposables.push(
            vscode.workspace.onDidChangeTextDocument(event => {
                this.snapshots.delete(event.document.fileName)
            })
        )
    }

    private servicesByTsconfigPath = new Map<string, TscLanguageService>()
    private disposables: vscode.Disposable[] = []
    private documentRegistry = ts.createDocumentRegistry(isMacOS() || isWindows(), currentDirectory())
    private snapshots = new Map<string, DocumentSnapshot>()

    private getOrLoadCompiler(file: FileURI): LoadedCompiler | undefined {
        const fromCache = this.getCompiler(file)
        if (fromCache) {
            return fromCache
        }
        this.loadCompiler(file)
        return this.getCompiler(file)
    }

    private readDocument(fileName: string): { text: string; version: string } {
        const fromCache = this.snapshots.get(fileName)
        if (fromCache) {
            return fromCache
        }
        if (!fileName.includes('node_modules')) {
            for (const document of vscode.workspace.textDocuments) {
                if (isFileURI(document.uri) && document.uri.fsPath === fileName) {
                    return { text: document.getText(), version: document.version.toString() }
                }
            }
        }
        const result = { text: ts.sys.readFile(fileName) ?? '', version: '0' }
        this.snapshots.set(fileName, result)
        return result
    }

    private defaultWorkingDirectory() {
        const uri = vscode.workspace.workspaceFolders?.[0]?.uri
        if (uri && isFileURI(uri)) {
            return uri.fsPath
        }
        return undefined
    }
    private loadCompiler(file: FileURI): undefined {
        const config = this.findConfigFile(file)
        if (!config) {
            logError('tsc-retriever', `Could not find tsconfig.json for URI ${file}`)
        }
        const parsedCommandLine = loadConfigFile(config)
        parsedCommandLine.options.strict = false
        const path = defaultPathFunctions()
        const currentDirectory = config
            ? path.dirname(config)
            : this.defaultWorkingDirectory() ?? process.cwd()
        const formatHost: ts.FormatDiagnosticsHost = ts.createCompilerHost(parsedCommandLine.options)
        const sourceFileNames: string[] = parsedCommandLine.fileNames
        const serviceHost: TscLanguageServiceHost = {
            ...formatHost,
            addSourceFile: fileName => sourceFileNames.push(fileName),
            getCompilationSettings: (): ts.CompilerOptions => parsedCommandLine.options,
            getScriptFileNames: (): string[] => sourceFileNames,
            getScriptVersion: (fileName: string): string => {
                return this.readDocument(fileName).version.toString()
            },
            getScriptSnapshot: (fileName: string): ts.IScriptSnapshot | undefined => {
                const doc = this.readDocument(fileName)
                return {
                    getLength: (): number => doc.text.length,
                    getText: (start, end) => doc.text.slice(start, end),
                    getChangeRange: () => undefined, // TODO: enable incremental parsing,
                    dispose: () => {},
                }
            },
            getCurrentDirectory: (): string => {
                return currentDirectory
            },
            getDefaultLibFileName: options => {
                // TODO(olafurpg): figure out why we need to hardcode
                // `node_modules` here.  I wasn't able to find examples from
                // sourcegraph.com/search that do the same but I wasn't able to
                // get ts.LanguageService working without it. My theory is that
                // we need it because the working directory of the process does
                // not match the workspace directory in VS Code, while most
                // examples from online are language servers where the working
                // directory is the same as the workspace root folder.
                const fileName = ts.getDefaultLibFileName(options)
                const result = path.resolve(
                    currentDirectory,
                    'node_modules',
                    'typescript',
                    'lib',
                    fileName
                )
                if (!ts.sys.fileExists(result)) {
                    const fallback = path.resolve(path.dirname(ts.sys.getExecutingFilePath()), fileName)
                    if (!ts.sys.fileExists(fallback)) {
                        throw new Error(`Could not find default lib at ${fallback}`)
                    }
                    return fallback
                }
                return result
            },
            readFile: (path: string, encoding?: string | undefined): string | undefined =>
                ts.sys.readFile(path, encoding),
            fileExists: (path: string): boolean => ts.sys.fileExists(path),
        }
        const service = ts.createLanguageService(serviceHost, this.documentRegistry)
        this.servicesByTsconfigPath.set(currentDirectory, { service, host: serviceHost })
    }

    private findConfigFile(file: FileURI): string | undefined {
        const config =
            ts.findConfigFile(path.dirname(file.fsPath), ts.sys.fileExists, 'tsconfig.json') ||
            ts.findConfigFile(path.dirname(file.fsPath), ts.sys.fileExists, 'tsconfig.json')
        if (!config) {
            return undefined
        }
        return config
    }
    private tryGetCompiler(service: ts.LanguageService, file: FileURI): LoadedCompiler | undefined {
        const program = service.getProgram()
        if (!program) {
            return undefined
        }
        const sourceFile = program.getSourceFile(file.fsPath)
        if (sourceFile === undefined) {
            return undefined
        }
        return {
            service,
            program,
            checker: program.getTypeChecker(),
            sourceFile,
        }
    }

    private getCompiler(file: FileURI): LoadedCompiler | undefined {
        for (const { service } of this.servicesByTsconfigPath.values()) {
            const compiler = this.tryGetCompiler(service, file)
            if (compiler) {
                return compiler
            }
        }

        const defaultService = this.findClosestService(file)
        if (defaultService) {
            const { service, host } = defaultService
            host.addSourceFile(file.fsPath)
            return this.tryGetCompiler(service, file)
        }
        return undefined
    }

    private findClosestService(file: FileURI): TscLanguageService | undefined {
        let closest: string | undefined
        let result: TscLanguageService | undefined
        for (const [dir, service] of this.servicesByTsconfigPath) {
            if (!file.fsPath.startsWith(dir)) {
                continue
            }
            if (closest === undefined || closest.length > dir.length) {
                closest = dir
                result = service
            }
        }
        return result ?? this.servicesByTsconfigPath.get(process.cwd())
    }

    private async doRetrieve(options: ContextRetrieverOptions): Promise<AutocompleteContextSnippet[]> {
        const uri = options.document.uri
        if (!isFileURI(uri)) {
            return []
        }
        const compiler = this.getOrLoadCompiler(uri)
        if (!compiler) {
            return []
        }

        // Loading the compiler can block the thread for a while, so we hand
        // back control to allow other promises to run before running symbol
        // collection.
        await nextTick()

        return new SymbolCollector(compiler, this.options, options, options.position).relevantSymbols()
    }

    public diagnostics(uri: FileURI): ProtocolDiagnostic[] {
        const compiler = this.getOrLoadCompiler(uri)
        if (!compiler) {
            logDebug('tsc-retriever', `No compiler for URI ${uri}`)
            return []
        }
        const diagnostics = compiler.program.getSemanticDiagnostics(compiler.sourceFile)
        const result: ProtocolDiagnostic[] = []
        for (const diagnostic of diagnostics) {
            const { file, start, code, source } = diagnostic
            if (file && start) {
                const relatedInformation: ProtocolRelatedInformationDiagnostic[] = []
                if (diagnostic.relatedInformation) {
                    for (const info of diagnostic.relatedInformation) {
                        if (!info.file || info.start === undefined) {
                            continue
                        }
                        const start = info.file.getLineAndCharacterOfPosition(info.start)
                        const end = info.file.getLineAndCharacterOfPosition(
                            info.start + (info.length ?? 1)
                        )
                        relatedInformation.push({
                            location: {
                                uri: vscode.Uri.file(info.file.fileName).toString(),
                                range: {
                                    start: { line: start.line, character: start.character },
                                    end: { line: end.line, character: end.character },
                                },
                            },
                            message: formatMessageText(info.messageText),
                        })
                    }
                }

                const { line, character } = file.getLineAndCharacterOfPosition(start)
                result.push({
                    location: {
                        uri: vscode.Uri.file(file.fileName).toString(),
                        range: {
                            start: { line, character },
                            end: { line, character: character + (diagnostic.length ?? 1) },
                        },
                    },
                    message: formatMessageText(diagnostic.messageText),
                    severity: 'error',
                    code: String(code),
                    source,
                    relatedInformation,
                })
            }
        }
        return result
    }

    public async retrieve(options: ContextRetrieverOptions): Promise<AutocompleteContextSnippet[]> {
        return tracer.startActiveSpan('graph-context.tsc', async span => {
            span.setAttribute('sampled', true)
            try {
                const result = await this.doRetrieve(options)
                // logDebug('tsc-retriever', JSON.stringify(result, null, 2))
                return result
            } catch (error) {
                logError('tsc-retriever', String(error))
                return []
            }
        })
    }

    public isSupportedForLanguageId(languageId: string): boolean {
        return supportedTscLanguages.has(languageId)
    }
    public dispose() {}
}

// Copy-pasted and adapted code from scip-typescript
function loadConfigFile(file: string | undefined): ts.ParsedCommandLine {
    const readResult = file ? ts.readConfigFile(file, path => ts.sys.readFile(path)) : { config: {} }

    if (readResult.error) {
        logError('tsc-retriever', ts.formatDiagnostics([readResult.error], ts.createCompilerHost({})))
    }

    const config = readResult.config
    if (config.compilerOptions !== undefined) {
        config.compilerOptions = {
            ...config.compilerOptions,
            ...defaultCompilerOptions(file),
        }
    }
    const result: ts.ParsedCommandLine = file
        ? ts.parseJsonConfigFileContent(config, ts.sys, path.dirname(file))
        : ts.parseCommandLine([])
    const errors: ts.Diagnostic[] = []
    for (const error of result.errors) {
        if (error.code === 18003) {
            // Ignore errors about missing 'input' fields, example:
            // > TS18003: No inputs were found in config file 'tsconfig.json'. Specified 'include' paths were '[]' and 'exclude' paths were '["out","node_modules","dist"]'.
            // The reason we ignore this error here is because we report the same
            // error at a higher-level.  It's common to hit on a single TypeScript
            // project with no sources when using the --yarnWorkspaces option.
            // Instead of failing fast at that single project, we only report this
            // error if all projects have no files.
            continue
        }
        errors.push(error)
    }
    if (errors.length > 0) {
        logError('tsc-retriever', ts.formatDiagnostics(errors, ts.createCompilerHost({})))
    }
    return result
}

function defaultCompilerOptions(configFileName?: string): ts.CompilerOptions {
    const options: ts.CompilerOptions =
        // Not a typo, jsconfig.json is a thing https://sourcegraph.com/search?q=context:global+file:jsconfig.json&patternType=literal
        configFileName && path.basename(configFileName) === 'jsconfig.json'
            ? {
                  allowJs: true,
                  maxNodeModuleJsDepth: 2,
                  allowSyntheticDefaultImports: true,
                  skipLibCheck: true,
                  noEmit: true,
              }
            : {}
    return options
}

function currentDirectory(): string | undefined {
    const uri = vscode.workspace.workspaceFolders?.[0]?.uri
    if (uri && isFileURI(uri)) {
        return uri.fsPath
    }
    return undefined
}

type TscLanguageServiceHost = ts.LanguageServiceHost & {
    addSourceFile(fileName: string): void
}

class SymbolCollector {
    private snippets: AutocompleteContextSnippet[] = []
    private nodeMatches = new Set<ts.Node>()
    private hasRemainingNodeMatches = () => this.nodeMatches.size < this.options.maxNodeMatches
    private hasRemainingChars = () =>
        this.addedContentChars < (this.contextOptions.hints?.maxChars ?? Number.POSITIVE_INFINITY)
    private addedContentChars = 0
    private isAdded = new Set<ts.Symbol>()
    private formatter: SymbolFormatter
    private offset: number
    private searchState: SearchState = SearchState.Continue
    private isSearchDone = () => this.searchState === SearchState.Done
    constructor(
        private readonly compiler: LoadedCompiler,
        private options: TscRetrieverOptions,
        private contextOptions: ContextRetrieverOptions,
        position: vscode.Position
    ) {
        this.formatter = new SymbolFormatter(this.compiler.checker, this.options.maxSymbolDepth)
        this.offset = this.compiler.sourceFile.getPositionOfLineAndCharacter(
            position.line,
            position.character
        )
    }

    public relevantSymbols(): AutocompleteContextSnippet[] {
        this.tryNodeMatch(this.compiler.sourceFile)
        for (const [queued, depth] of this.formatter.queue.entries()) {
            if (depth > this.options.maxSymbolDepth) {
                continue
            }
            const budget = this.options.maxTotalSnippets - this.snippets.length
            this.addSymbol(queued, budget, depth)
        }
        return this.snippets
    }

    private addSymbol(
        sym: ts.Symbol,
        remainingNodeMatchKindSnippetBudget: number,
        depth: number
    ): number {
        if (depth > this.options.maxSymbolDepth) {
            return 0
        }
        if (this.isAdded.has(sym)) {
            return 0
        }
        if (this.formatter.isRendered.has(sym)) {
            // Skip this symbol if it's a child of a symbol that we have already
            // formatted.  For example, if we render `interface A { a: number }`
            // then we don't need to render `(property) A.a: number` separately
            // because it's redunant with the interface declaration.
            return 0
        }
        this.isAdded.add(sym)
        // Symbols with multiple declarations are normally overloaded
        // functions, in which case we want to show all available
        // signatures.
        let addedCount = 0

        for (const declaration of sym.declarations ?? []) {
            if (isStdLibNode(declaration)) {
                // Skip stdlib types because the LLM most likely knows how
                // it works anyways.
                continue
            }
            if (
                !this.options.includeSymbolsInCurrentFile &&
                declaration.getSourceFile() === this.compiler.sourceFile
            ) {
                continue
            }
            switch (declaration.kind) {
                case ts.SyntaxKind.TypeParameter:
                case ts.SyntaxKind.Parameter:
                case ts.SyntaxKind.ImportDeclaration:
                case ts.SyntaxKind.ImportClause:
                case ts.SyntaxKind.ImportSpecifier:
                case ts.SyntaxKind.ImportAttribute:
                case ts.SyntaxKind.ImportAttributes:
                case ts.SyntaxKind.NamedImports:
                case ts.SyntaxKind.NamespaceImport:
                    continue
            }
            const sourceFile = declaration.getSourceFile()
            const start = sourceFile.getLineAndCharacterOfPosition(declaration.getStart())
            const end = sourceFile.getLineAndCharacterOfPosition(declaration.getEnd())
            const content = this.formatter.formatSymbol(declaration, sym, depth)
            if (!ts.isModuleDeclaration(declaration)) {
                // Skip module declarations because they can be too large.
                // We still format them to queue the referenced types.
                const snippet: AutocompleteContextSnippet = {
                    symbol: sym.name,
                    content,
                    startLine: start.line,
                    endLine: end.line,
                    uri: vscode.Uri.file(sourceFile.fileName),
                }
                this.addedContentChars += content.length
                this.snippets.push(snippet)
                addedCount++
                if (this.snippets.length >= this.options.maxTotalSnippets) {
                    this.searchState = SearchState.Done
                    break
                }
                if (!this.hasRemainingChars()) {
                    this.searchState = SearchState.Done
                    break
                }
                if (remainingNodeMatchKindSnippetBudget - addedCount <= 0) {
                    break
                }
            }
        }

        return addedCount
    }

    private tryNodeMatch(node: ts.Node): void {
        if (this.isSearchDone()) {
            return
        }

        // Loop on children first to boost symbol results that are closer to the
        // cursor location.
        ts.forEachChild(node, child => {
            if (this.isSearchDone()) {
                return
            }
            this.tryNodeMatch(child)
        })

        if (this.isSearchDone()) {
            return
        }

        if (this.offset < node.getStart() || this.offset > node.getEnd()) {
            // Subtree does not enclose the request position.
            return
        }

        let addedCount = 0
        const { kind, nodes } = relevantTypeIdentifiers(this.compiler.checker, node)
        const budget =
            this.options.maxSnippetsPerNodeMatch.get(kind) ?? this.options.defaultSnippetsPerNodeMatch
        for (const identifier of nodes) {
            const symbol = getTSSymbolAtLocation(this.compiler.checker, identifier)
            if (symbol) {
                addedCount += this.addSymbol(symbol, budget - addedCount, 0)
            }
        }
        if (addedCount > 0) {
            this.nodeMatches.add(node)
            if (!this.hasRemainingNodeMatches()) {
                this.searchState = SearchState.Done
            }
        }
    }
}

enum SearchState {
    Done = 1,
    Continue = 2,
}

function formatMessageText(messageText: string | ts.DiagnosticMessageChain): string {
    if (typeof messageText === 'string') {
        return messageText
    }
    const messages: string[] = []
    const visited = new Set<ts.DiagnosticMessageChain>()
    const loop = (chain: ts.DiagnosticMessageChain): void => {
        if (visited.has(chain)) {
            return
        }
        visited.add(chain)

        messages.push(chain.messageText)
        if (chain.next) {
            for (const next of chain.next) {
                loop(next)
            }
        }
    }
    loop(messageText)
    return messages.join('\n')
}
