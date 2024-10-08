import type { Span } from '@opentelemetry/api'
import {
    type ContextItem,
    PromptString,
    firstValueFrom,
    logDebug,
    pendingOperation,
    ps,
} from '@sourcegraph/cody-shared'
import { getContextFromRelativePath } from '../../commands/context/file-path'
import { getContextFileFromShell } from '../../commands/context/shell'
import { type ContextRetriever, toStructuredMentions } from '../chat-view/ContextRetriever'
import { getCorpusContextItemsForEditorState } from '../initialContext'

export interface PromptConfig {
    instruction: PromptString
    placeholder: PromptString
    example: PromptString
}

export abstract class CodyTool {
    abstract readonly tag: PromptString
    abstract readonly subTag: PromptString
    abstract readonly prompt: PromptConfig

    protected rawText = ''

    public getInstruction(): PromptString {
        const { instruction, placeholder } = this.prompt
        return ps`${instruction}:
   <${this.tag}><${this.subTag}>$${placeholder}</${this.subTag}></${this.tag}>`
    }

    public parse(): string[] {
        const regex = new RegExp(`<${this.subTag}>(.+?)</?${this.subTag}>`, 's')
        const parsed = (this.rawText.match(new RegExp(regex, 'g')) || [])
            .map(match => regex.exec(match)?.[1].trim())
            .filter(Boolean) as string[]
        if (parsed.length) {
            logDebug('CodyTool', this.tag.toString(), { verbose: parsed })
        }
        this.rawText = ''
        return parsed
    }

    public stream(text: string): void {
        this.rawText += text
    }

    abstract execute(): Promise<ContextItem[]>
}

class CliTool extends CodyTool {
    public readonly tag = ps`TOOLCLI`
    public readonly subTag = ps`cmd`

    public readonly prompt = {
        instruction: ps`To see the output of shell commands`,
        placeholder: ps`SHELL_COMMAND`,
        example: ps`Details about GitHub issue#1234: <TOOLCLI><cmd>gh issue view 1234</cmd></TOOLCLI>`,
    }

    async execute(): Promise<ContextItem[]> {
        const commands = this.parse()
        logDebug('CodyTool', `executing ${commands.length} commands`)
        return Promise.all(commands.map(getContextFileFromShell)).then(results => results.flat())
    }
}

class FileTool extends CodyTool {
    public readonly tag = ps`TOOLFILE`
    public readonly subTag = ps`name`

    public readonly prompt = {
        instruction: ps`To retrieve full content of a codebase file`,
        placeholder: ps`FILENAME`,
        example: ps`See the content of different files: <TOOLFILE><name>path/foo.ts</name><name>path/bar.ts</name></TOOLFILE>`,
    }

    async execute(): Promise<ContextItem[]> {
        const filePaths = this.parse()
        logDebug('CodyTool', `requesting ${filePaths.length} files`)
        return Promise.all(filePaths.map(getContextFromRelativePath)).then(results =>
            results.filter((item): item is ContextItem => item !== null)
        )
    }
}

class SearchTool extends CodyTool {
    public readonly tag = ps`TOOLSEARCH`
    public readonly subTag = ps`query`

    public readonly prompt = {
        instruction: ps`To search for context in the codebase`,
        placeholder: ps`SEARCH_QUERY`,
        example: ps`Find usage of "node:fetch" in my codebase: <TOOLSEARCH><query>node:fetch</query></TOOLSEARCH>`,
    }

    constructor(
        private contextRetriever: Pick<ContextRetriever, 'retrieveContext'>,
        private span: Span
    ) {
        super()
    }

    private performedSearch = new Set<string>()

    async execute(): Promise<ContextItem[]> {
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
        const context = await this.contextRetriever.retrieveContext(
            toStructuredMentions([repo]),
            PromptString.unsafe_fromLLMResponse(query),
            this.span
        )
        // Store the search query to avoid running the same query again.
        this.performedSearch.add(query)
        logDebug('CodyTool', `searching codebase for ${query}`)
        return context
    }
}

export function getCodyTools(
    contextRetriever: Pick<ContextRetriever, 'retrieveContext'>,
    span: Span
): CodyTool[] {
    return [new SearchTool(contextRetriever, span), new CliTool(), new FileTool()]
}
