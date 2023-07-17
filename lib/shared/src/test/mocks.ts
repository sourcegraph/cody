import { BotResponseMultiplexer } from '../chat/bot-response-multiplexer'
import { RecipeContext } from '../chat/recipes/recipe'
import { CodebaseContext } from '../codebase-context'
import { Editor, Indentation, LightTextDocument, TextDocument, TextEdit, ViewControllers, Workspace } from '../editor'
import { EmbeddingsSearch } from '../embeddings'
import { IntentDetector } from '../intent-detector'
import { ContextResult, KeywordContextFetcher } from '../local-context'
import { EmbeddingsSearchResults } from '../sourcegraph-api/graphql'

export class MockEmbeddingsClient implements EmbeddingsSearch {
    constructor(private mocks: Partial<EmbeddingsSearch> = {}) {}

    public search(
        query: string,
        codeResultsCount: number,
        textResultsCount: number
    ): Promise<EmbeddingsSearchResults | Error> {
        return (
            this.mocks.search?.(query, codeResultsCount, textResultsCount) ??
            Promise.resolve({ codeResults: [], textResults: [] })
        )
    }
}

export class MockIntentDetector implements IntentDetector {
    constructor(private mocks: Partial<IntentDetector> = {}) {}

    public isCodebaseContextRequired(input: string): Promise<boolean | Error> {
        return this.mocks.isCodebaseContextRequired?.(input) ?? Promise.resolve(false)
    }

    public isEditorContextRequired(input: string): boolean | Error {
        return this.mocks.isEditorContextRequired?.(input) ?? false
    }
}

export class MockKeywordContextFetcher implements KeywordContextFetcher {
    constructor(private mocks: Partial<KeywordContextFetcher> = {}) {}

    public getContext(query: string, numResults: number): Promise<ContextResult[]> {
        return this.mocks.getContext?.(query, numResults) ?? Promise.resolve([])
    }

    public getSearchContext(query: string, numResults: number): Promise<ContextResult[]> {
        return this.mocks.getSearchContext?.(query, numResults) ?? Promise.resolve([])
    }
}

export class MockEditor extends Editor {
    public controllers?: ViewControllers | undefined

    constructor(private mocks: Partial<Editor> = {}) {
        super()

        this.controllers = mocks.controllers
    }

    public getActiveWorkspace(): Workspace | null {
        return this.mocks.getActiveWorkspace?.() ?? null
    }

    public getWorkspaceOf(uri: string): Workspace | null {
        return this.mocks.getWorkspaceOf?.(uri) ?? null
    }

    public getActiveTextDocument(): TextDocument | null {
        return this.mocks.getActiveTextDocument?.() ?? null
    }

    public getOpenLightTextDocuments(): LightTextDocument[] {
        return this.mocks.getOpenLightTextDocuments?.() ?? []
    }

    public getLightTextDocument(uri: string): Promise<LightTextDocument | null> {
        return this.mocks.getLightTextDocument?.(uri) ?? Promise.resolve(null)
    }

    public getTextDocument(uri: string): Promise<TextDocument | null> {
        return this.mocks.getTextDocument?.(uri) ?? Promise.resolve(null)
    }

    public edit(uri: string, edits: TextEdit[]): Promise<boolean> {
        return this.mocks.edit?.(uri, edits) ?? Promise.resolve(false)
    }

    public replaceSelection(fileName: string, selectedText: string, replacement: string): Promise<void> {
        return this.mocks.replaceSelection?.(fileName, selectedText, replacement) ?? Promise.resolve()
    }

    public quickPick(labels: string[]): Promise<string | null> {
        return this.mocks.quickPick?.(labels) ?? Promise.resolve(null)
    }

    public warn(message: string): Promise<void> {
        return this.mocks.warn?.(message) ?? Promise.resolve()
    }

    public prompt(prompt?: string | undefined): Promise<string | null> {
        return this.mocks.prompt?.(prompt) ?? Promise.resolve(null)
    }

    public getIndentation(): Indentation {
        return (
            this.mocks.getIndentation?.() ?? {
                kind: 'space',
                size: 4,
            }
        )
    }

    public didReceiveFixupText(id: string, text: string, state: 'streaming' | 'complete'): Promise<void> {
        return this.mocks.didReceiveFixupText?.(id, text, state) ?? Promise.resolve()
    }
}

export const defaultEmbeddingsClient = new MockEmbeddingsClient()

export const defaultIntentDetector = new MockIntentDetector()

export const defaultKeywordContextFetcher = new MockKeywordContextFetcher()

export const defaultEditor = new MockEditor()

export function newRecipeContext(args?: Partial<RecipeContext>): RecipeContext {
    args = args || {}
    return {
        editor: args.editor || defaultEditor,
        intentDetector: args.intentDetector || defaultIntentDetector,
        codebaseContext:
            args.codebaseContext ||
            new CodebaseContext(
                { useContext: 'none', serverEndpoint: 'https://example.com' },
                'dummy-codebase',
                defaultEmbeddingsClient,
                defaultKeywordContextFetcher,
                null
            ),
        responseMultiplexer: args.responseMultiplexer || new BotResponseMultiplexer(),
        firstInteraction: args.firstInteraction ?? false,
    }
}
