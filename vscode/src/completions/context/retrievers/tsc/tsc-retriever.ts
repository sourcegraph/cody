import {
    type AutocompleteContextSnippet,
    type FileURI,
    defaultPathFunctions,
    isFileURI,
    isMacOS,
    isWindows,
    logError,
    tracer,
} from '@sourcegraph/cody-shared'
import ts from 'typescript'
import * as vscode from 'vscode'
import type { ContextRetriever, ContextRetrieverOptions } from '../../../types'
import { SymbolFormatter, isStdLibNode } from './SymbolFormatter'
import { getTSSymbolAtLocation } from './getTSSymbolAtLocation'
import { relevantTypeIdentifiers } from './relevantTypeIdentifiers'

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
     * The "symbol depth" determines how many nested layers of signatures we
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
        includeSymbolsInCurrentFile: false,
        maxNodeMatches: vscode.workspace
            .getConfiguration('sourcegraph')
            .get<number>('cody.autocomplete.experimental.maxTscResults', 1),
        maxSymbolDepth: 1,
    }
}

interface TscLanguageService {
    service: ts.LanguageService
    host: TscLanguageServiceHost
}
/**
 * The tsc retriever uses the TypeScript compiler API to retrieve contextual
 * information about the autocomplete request location.
 */
export class TscRetriever implements ContextRetriever {
    public identifier = 'tsc'

    constructor(private options: TscRetrieverOptions = defaultTscRetrieverOptions()) {}

    private servicesByTsconfigPath = new Map<string, TscLanguageService>()
    private baseCompilerHost: ts.FormatDiagnosticsHost = ts.createCompilerHost({})
    private disposables: vscode.Disposable[] = []
    private documentRegistry = ts.createDocumentRegistry(isMacOS() || isWindows(), currentDirectory())

    private getOrLoadCompiler(file: FileURI): LoadedCompiler | undefined {
        const fromCache = this.getCompiler(file)
        if (fromCache) {
            return fromCache
        }
        this.loadCompiler(file)
        return this.getCompiler(file)
    }

    private readDocument(fileName: string): { text: string; version: string } {
        for (const document of vscode.workspace.textDocuments) {
            if (isFileURI(document.uri) && document.uri.fsPath === fileName) {
                return { text: document.getText(), version: document.version.toString() }
            }
        }
        return { text: ts.sys.readFile(fileName) ?? '', version: '0' }
    }

    private loadCompiler(file: FileURI): undefined {
        const config = this.findConfigFile(file)
        if (!config) {
            logError('tsc-retriever', `Could not find tsconfig.json for URI ${file}`)
        }
        const parsedCommandLine = loadConfigFile(config)
        const path = defaultPathFunctions()
        const currentDirectory = config ? path.dirname(config) : process.cwd()
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
        const diagnostics = program.getGlobalDiagnostics()
        if (diagnostics.length > 0) {
            console.log(ts.formatDiagnostics(diagnostics, this.baseCompilerHost))
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

    private doBlockingRetrieve(options: ContextRetrieverOptions): AutocompleteContextSnippet[] {
        const uri = options.document.uri
        if (!isFileURI(uri)) {
            return []
        }
        const compiler = this.getOrLoadCompiler(uri)
        if (!compiler) {
            return []
        }
        try {
            return new SymbolCollector(compiler, this.options, options.position).relevantSymbols()
        } catch (error) {
            logError('tsc-retriever', 'unexpected error', error)
            return []
        }
    }

    public retrieve(options: ContextRetrieverOptions): Promise<AutocompleteContextSnippet[]> {
        return new Promise<AutocompleteContextSnippet[]>(resolve => {
            tracer.startActiveSpan('graph-context.tsc', span => {
                span.setAttribute('sampled', true)
                try {
                    resolve(this.doBlockingRetrieve(options))
                } catch (error) {
                    logError('tsc-retriever', String(error))
                    resolve([])
                }
            })
        })
    }

    public isSupportedForLanguageId(languageId: string): boolean {
        return (
            languageId === 'typescript' ||
            languageId === 'typescriptreact' ||
            languageId === 'javascript' ||
            languageId === 'javascriptreact'
        )
    }
    public dispose() {
        vscode.Disposable.from(...this.disposables).dispose()
    }
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
    private toplevelNodes = new Set<ts.Node>()
    private isDone = () => this.toplevelNodes.size >= this.options.maxNodeMatches
    private isAdded = new Set<ts.Symbol>()
    private formatter: SymbolFormatter
    private offset: number
    constructor(
        private readonly compiler: LoadedCompiler,
        private options: TscRetrieverOptions,
        position: vscode.Position
    ) {
        this.formatter = new SymbolFormatter(this.compiler.checker)
        this.offset = this.compiler.sourceFile.getPositionOfLineAndCharacter(
            position.line,
            position.character
        )
    }

    public relevantSymbols(): AutocompleteContextSnippet[] {
        this.loop(this.compiler.sourceFile)
        return this.snippets
    }

    private addSymbol(sym: ts.Symbol, depth: number): boolean {
        if (depth > this.options.maxSymbolDepth) {
            return false
        }
        if (this.isAdded.has(sym)) {
            return false
        }
        if (this.formatter.isRendered.has(sym)) {
            // Skip this symbol if it's a child of a symbol that we have already
            // formatted.  For example, if we render `interface A { a: number }`
            // then we don't need to render `(property) A.a: number` separately
            // because it's redunant with the interface declaration.
            return false
        }
        this.isAdded.add(sym)
        // Symbols with multiple declarations are normally overloaded
        // functions, in which case we want to show all available
        // signatures.
        let isAdded = false
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
            if (this.isDone()) {
                continue
            }
            const sourceFile = declaration.getSourceFile()
            const start = sourceFile.getLineAndCharacterOfPosition(declaration.getStart())
            const end = sourceFile.getLineAndCharacterOfPosition(declaration.getEnd())
            const { formatted: content, queue } = this.formatter.formatSymbolWithQueue(sym)
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
                this.snippets.push(snippet)
            }
            for (const queued of queue) {
                this.addSymbol(queued, depth + 1)
            }
            isAdded = true
        }

        return isAdded
    }

    private loop(node: ts.Node): void {
        if (this.isDone()) {
            return
        }

        // Loop on children first to boost symbol results that are closer to the
        // cursor location.
        ts.forEachChild(node, child => this.loop(child))

        if (this.isDone()) {
            return
        }

        if (this.offset < node.getStart() || this.offset > node.getEnd()) {
            return
        }

        let isAdded = false
        for (const identifier of relevantTypeIdentifiers(this.compiler.checker, node)) {
            const symbol = getTSSymbolAtLocation(this.compiler.checker, identifier)
            if (symbol) {
                const gotAdded = this.addSymbol(symbol, 0)
                isAdded ||= gotAdded
            }
        }
        if (isAdded) {
            this.toplevelNodes.add(node)
        }
    }
}
