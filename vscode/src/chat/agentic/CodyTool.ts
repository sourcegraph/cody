import type { ImportedProviderConfiguration } from '@openctx/client'
import type { Span } from '@opentelemetry/api'
import {
    type ContextItem,
    type ContextItemOpenCtx,
    ContextItemSource,
    type ContextMentionProviderMetadata,
    PromptString,
    firstValueFrom,
    logDebug,
    parseMentionQuery,
    pendingOperation,
    ps,
} from '@sourcegraph/cody-shared'
import { getContextFromRelativePath } from '../../commands/context/file-path'
import { getContextFileFromShell } from '../../commands/context/shell'
import { type ContextRetriever, toStructuredMentions } from '../chat-view/ContextRetriever'
import { getChatContextItemsForMention } from '../context/chatContext'
import { getCorpusContextItemsForEditorState } from '../initialContext'

export interface CodyToolConfig {
    tags: {
        tag: PromptString
        subTag: PromptString
    }
    prompt: {
        instruction: PromptString
        placeholder: PromptString
        example: PromptString
    }
}

export abstract class CodyTool {
    protected rawText = ''

    constructor(public readonly config: CodyToolConfig) {}

    public getInstruction(): PromptString {
        const { tag, subTag } = this.config.tags
        const { instruction, placeholder } = this.config.prompt
        return ps`${instruction}:
   <${tag}><${subTag}>${placeholder}</${subTag}></${tag}>`
    }

    protected parse(): string[] {
        const { tag, subTag } = this.config.tags
        const regex = new RegExp(`<${subTag}>(.+?)</?${subTag}>`, 's')
        const parsed = (this.rawText.match(new RegExp(regex, 'g')) || [])
            .map(match => regex.exec(match)?.[1].trim())
            .filter(Boolean) as string[]
        if (parsed.length) {
            logDebug('CodyTool', tag.toString(), { verbose: parsed })
        }
        this.reset()
        return parsed
    }

    public stream(text: string): void {
        this.rawText += text
    }

    public abstract execute(span: Span): Promise<ContextItem[]>

    private reset(): void {
        this.rawText = ''
    }
}

export class CliTool extends CodyTool {
    constructor() {
        super({
            tags: {
                tag: ps`TOOLCLI`,
                subTag: ps`cmd`,
            },
            prompt: {
                instruction: ps`To see the output of shell commands`,
                placeholder: ps`SHELL_COMMAND`,
                example: ps`Details about GitHub issue#1234: <TOOLCLI><cmd>gh issue view 1234</cmd></TOOLCLI>`,
            },
        })
    }

    public async execute(): Promise<ContextItem[]> {
        const commands = this.parse()
        if (commands.length === 0) return []
        logDebug('CodyTool', `executing ${commands.length} commands...`)
        return Promise.all(commands.map(getContextFileFromShell)).then(results => results.flat())
    }
}

export class FileTool extends CodyTool {
    constructor() {
        super({
            tags: {
                tag: ps`TOOLFILE`,
                subTag: ps`name`,
            },
            prompt: {
                instruction: ps`To retrieve full content of a codebase file`,
                placeholder: ps`FILENAME`,
                example: ps`See the content of different files: <TOOLFILE><name>path/foo.ts</name><name>path/bar.ts</name></TOOLFILE>`,
            },
        })
    }

    public async execute(): Promise<ContextItem[]> {
        const filePaths = this.parse()
        if (filePaths.length === 0) return []
        logDebug('CodyTool', `requesting ${filePaths.length} files`)
        return Promise.all(filePaths.map(getContextFromRelativePath)).then(results =>
            results.filter((item): item is ContextItem => item !== null)
        )
    }
}

export class SearchTool extends CodyTool {
    private performedSearch = new Set<string>()

    constructor(private contextRetriever: Pick<ContextRetriever, 'retrieveContext'>) {
        super({
            tags: {
                tag: ps`TOOLSEARCH`,
                subTag: ps`query`,
            },
            prompt: {
                instruction: ps`To search for context in the codebase`,
                placeholder: ps`SEARCH_QUERY`,
                example: ps`Find usage of "node:fetch" in my codebase: <TOOLSEARCH><query>node:fetch</query></TOOLSEARCH>`,
            },
        })
    }

    public async execute(span: Span): Promise<ContextItem[]> {
        const queries = this.parse()
        const query = queries[0] // There should only be one query.
        if (!this.contextRetriever || !query || this.performedSearch.has(query)) {
            return []
        }
        // Get the latest corpus context items
        const corpusItems = await firstValueFrom(getCorpusContextItemsForEditorState())
        if (corpusItems === pendingOperation || corpusItems.length === 0) {
            return []
        }
        // Find the first item that represents a repository
        const repo = corpusItems.find(i => i.type === 'tree' || i.type === 'repository')
        if (!repo) {
            return []
        }
        logDebug('CodyTool', `searching codebase for ${query}`)
        const context = await this.contextRetriever.retrieveContext(
            toStructuredMentions([repo]),
            PromptString.unsafe_fromLLMResponse(query),
            span
        )
        // Store the search query to avoid running the same query again.
        this.performedSearch.add(query)
        const maxSearchItems = 30 // Keep the latest n items and remove the rest.
        return context.slice(-maxSearchItems)
    }
}

export class OpenCtxTool extends CodyTool {
    constructor(
        private provider: ImportedProviderConfiguration,
        config: CodyToolConfig
    ) {
        super(config)
    }

    async execute(): Promise<ContextItem[]> {
        const queries = this.parse()
        if (!queries?.length) {
            return []
        }
        logDebug('CodyTool', `searching ${this.provider.providerUri} for "${queries}"`)
        const results: ContextItem[] = []
        const idObject: Pick<ContextMentionProviderMetadata, 'id'> = { id: this.provider.providerUri }
        try {
            for (const query of queries) {
                const mention = parseMentionQuery(query, idObject)
                const items = (await getChatContextItemsForMention({ mentionQuery: mention })).map(
                    mention => {
                        const item = mention as ContextItemOpenCtx
                        const content = item.mention?.description ?? item.mention?.data?.content
                        return { ...item, content, source: ContextItemSource.Agentic }
                    }
                )
                results.push(...items)
            }
            logDebug('CodyTool', `OpenCtx returned ${results.length} items`, { verbose: results })
        } catch {
            logDebug('CodyTool', `OpenCtx item retrieval failed for ${queries}`)
        }
        return results
    }
}
