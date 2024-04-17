import {
    type AutocompleteContextSnippet,
    type FileURI,
    isFileURI,
    isMacOS,
    isWindows,
    logError,
} from '@sourcegraph/cody-shared'
import { defaultPathFunctions } from '@sourcegraph/cody-shared/src/common/path'
import * as ts from 'typescript'
import * as vscode from 'vscode'
import type { ContextRetriever, ContextRetrieverOptions } from '../../../types'
import { SymbolFormatter, declarationName } from './SymbolFormatter'
import { getTSSymbolAtLocation } from './getTSSymbolAtLocation'

interface LoadedCompiler {
    service: ts.LanguageService
    program: ts.Program
    checker: ts.TypeChecker
    sourceFile: ts.SourceFile
}

const path = defaultPathFunctions()

function currentDirectory(): string | undefined {
    const uri = vscode.workspace.workspaceFolders?.[0]?.uri
    if (uri && isFileURI(uri)) {
        return uri.fsPath
    }
    return undefined
}

const MAX_SYMBOL_RESULTS = vscode.workspace
    .getConfiguration('sourcegraph')
    .get<number>('cody.autocomplete.experimental.maxTscResults', 10)

/**
 * The tsc retriever uses the TypeScript compiler API to retrieve contextual
 * information about the autocomplete request location.
 */
export class TscRetriever implements ContextRetriever {
    public identifier = 'tsc'

    private servicesByTsconfigPath = new Map<string, ts.LanguageService>()
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
        const currentDirectory = config ? path.dirname(config) : ts.sys.getExecutingFilePath()
        const formatHost: ts.FormatDiagnosticsHost = ts.createCompilerHost(parsedCommandLine.options)
        const serviceHost: ts.LanguageServiceHost = {
            ...formatHost,
            getCompilationSettings: (): ts.CompilerOptions => parsedCommandLine.options,
            getScriptFileNames: (): string[] => parsedCommandLine.fileNames,
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
                // TODO: the fact we need this hints thats why `ts.getDefaultLibFilePath` doesn't work
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
        this.servicesByTsconfigPath.set(config ?? 'DEFAULT', service)
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
    private getCompiler(file: FileURI): LoadedCompiler | undefined {
        for (const service of this.servicesByTsconfigPath.values()) {
            const program = service.getProgram()
            if (!program) {
                continue
            }
            const sourceFile = program.getSourceFile(file.fsPath)
            if (sourceFile === undefined) {
                continue
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
        return undefined
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
            const result = this.relevantSymbols(compiler, options.position)
            result.reverse()

            return result
        } catch (error) {
            console.log('boom', error)
            return []
        }
    }

    private relevantSymbols(
        compiler: LoadedCompiler,
        position: vscode.Position
    ): AutocompleteContextSnippet[] {
        const result: AutocompleteContextSnippet[] = []
        const formatter = new SymbolFormatter(compiler.checker)
        const offset = compiler.sourceFile.getPositionOfLineAndCharacter(
            position.line,
            position.character
        )
        const isAdded = new Set<ts.Symbol>()
        function addSymbol(symbol: ts.Symbol): void {
            if (isAdded.has(symbol)) {
                return
            }
            isAdded.add(symbol)
            // Symbols with multiple declarations are normally overloaded
            // functions, in which case we want to show all available
            // signatures.
            for (const declaration of symbol.declarations ?? []) {
                if (isStdLibNode(declaration)) {
                    // Skip stdlib types because the LLM most likely knows how
                    // it works anyways.
                    continue
                }
                if (ts.isTypeParameterDeclaration(declaration) || ts.isParameter(declaration)) {
                    continue
                }
                if (result.length >= MAX_SYMBOL_RESULTS) {
                    continue
                }
                const name = declarationName(declaration)
                if (!name) {
                    continue
                }
                const sourceFile = declaration.getSourceFile()
                const start = sourceFile.getLineAndCharacterOfPosition(declaration.getStart())
                const end = sourceFile.getLineAndCharacterOfPosition(declaration.getEnd())
                const content = formatter.formatSymbol(name, symbol)
                const snippet: AutocompleteContextSnippet = {
                    symbol: symbol.name,
                    content,
                    startLine: start.line,
                    endLine: end.line,
                    uri: vscode.Uri.file(sourceFile.fileName),
                }
                result.push(snippet)
            }
        }
        function loop(n: ts.Node): void {
            if (result.length >= MAX_SYMBOL_RESULTS) {
                return
            }

            // Loop on children first to boost symbol results that are closer to the cursor location.
            ts.forEachChild(n, loop)

            if (result.length >= MAX_SYMBOL_RESULTS) {
                return
            }

            if (offset < n.getStart() || n.getEnd() < offset) {
                return
            }

            for (const identifier of typeIdentifiers(compiler.checker, n)) {
                const symbol = getTSSymbolAtLocation(compiler.checker, identifier)
                if (symbol && !isAdded.has(symbol)) {
                    addSymbol(symbol)
                    for (const queued of formatter.queuedSymbols) {
                        addSymbol(queued)
                    }
                }
            }
        }
        loop(compiler.sourceFile)
        return result
    }

    public retrieve(options: ContextRetrieverOptions): Promise<AutocompleteContextSnippet[]> {
        return new Promise<AutocompleteContextSnippet[]>(resolve => {
            try {
                resolve(this.doBlockingRetrieve(options))
            } catch (error) {
                logError('tsc-retriever', String(error))
                resolve([])
            }
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

// Returns true if this node is defined in the TypeScript stdlib.
function isStdLibNode(node: ts.Node): boolean {
    const basename = path.basename(node.getSourceFile().fileName)
    // HACK: this solution has false positives. We should use the
    // scip-typescript package logic to determine this reliably.
    return basename.startsWith('lib.') && basename.endsWith('.d.ts')
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

function typeIdentifiers(checker: ts.TypeChecker, node: ts.Node): ts.Node[] {
    const result: ts.Node[] = []
    pushTypeIdentifiers(result, checker, node)
    return result
}
function pushTypeIdentifiers(result: ts.Node[], checker: ts.TypeChecker, node: ts.Node): void {
    if (ts.isSourceFile(node)) {
        ts.forEachChild(node, child => {
            if (ts.isImportDeclaration(child)) {
                pushDescendentIdentifiers(result, child)
            }
        })
    } else if (
        ts.isSetAccessorDeclaration(node) ||
        ts.isGetAccessorDeclaration(node) ||
        ts.isConstructorDeclaration(node) ||
        ts.isFunctionDeclaration(node) ||
        ts.isCallSignatureDeclaration(node) ||
        ts.isMethodDeclaration(node)
    ) {
        for (const parameter of node.parameters) {
            if (parameter.type) {
                pushDescendentIdentifiers(result, parameter.type)
            }
        }
        if (node.type) {
            pushDescendentIdentifiers(result, node.type)
        }
    } else if (ts.isCallExpression(node)) {
        const symbol = getTSSymbolAtLocation(checker, node.expression)
        for (const declaration of symbol?.declarations ?? []) {
            pushTypeIdentifiers(result, checker, declaration)
        }
    } else if (ts.isVariableDeclaration(node)) {
        if (node.type) {
            pushTypeIdentifiers(result, checker, node.type)
        }
    } else if (ts.isTypeLiteralNode(node)) {
        for (const member of node.members) {
            pushTypeIdentifiers(result, checker, member)
        }
    }
}

function walk(node: ts.Node, handler: (node: ts.Node) => void): void {
    ts.forEachChild(node, child => {
        handler(child)
        walk(child, handler)
    })
}

function pushDescendentIdentifiers(result: ts.Node[], node: ts.Node): void {
    walk(node, child => {
        if (ts.isIdentifier(child)) {
            result.push(child)
        }
    })
}
