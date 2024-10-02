import type { Span } from '@opentelemetry/api'
import {
    type ContextItem,
    PromptString,
    firstValueFrom,
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

    protected content = ''

    public getInstruction(): PromptString {
        const { instruction, placeholder } = this.prompt
        return ps`${instruction}:
   <${this.tag}><${this.subTag}>${placeholder}</${this.subTag}></${this.tag}>`
    }

    public parse(): string[] {
        const regex = new RegExp(`<${this.subTag}>(.+?)</${this.subTag}>`, 's')
        return (this.content.match(new RegExp(regex, 'g')) || [])
            .map(match => regex.exec(match)?.[1].trim())
            .filter(Boolean) as string[]
    }

    public process(content: string): void {
        this.content += content
    }

    abstract execute(): Promise<ContextItem[]>
}

class CliTool extends CodyTool {
    public readonly tag = ps`CODYTOOLCLI`
    public readonly subTag = ps`cmd`

    public readonly prompt = {
        instruction: ps`To see the output of shell commands`,
        placeholder: ps`SHELL_COMMAND`,
        example: ps`
        To get details for GitHub issue #1234, use:
        <CODYTOOLCLI><cmd>gh issue view 1234</cmd></CODYTOOLCLI>`,
    }

    async execute(): Promise<ContextItem[]> {
        const commands = this.parse()
        this.content = ''
        return Promise.all(commands.map(getContextFileFromShell)).then(results => results.flat())
    }
}

class FileTool extends CodyTool {
    public readonly tag = ps`CODYTOOLFILE`
    public readonly subTag = ps`file`

    public readonly prompt = {
        instruction: ps`To retrieve full content from a file`,
        placeholder: ps`FILEPATH`,
        example: ps`<CODYTOOLFILE><file>.gitignore</file></CODYTOOLFILE>`,
    }

    async execute(): Promise<ContextItem[]> {
        const filePaths = this.parse()
        this.content = ''
        return Promise.all(filePaths.map(getContextFromRelativePath)).then(results =>
            results.filter((item): item is ContextItem => item !== null)
        )
    }
}

class SearchTool extends CodyTool {
    public readonly tag = ps`CODYTOOLSEARCH`
    public readonly subTag = ps`query`

    public readonly prompt = {
        instruction: ps`For additional context from the codebase`,
        placeholder: ps`SEARCH_QUERY`,
        example: ps``,
    }

    constructor(
        private contextRetriever: ContextRetriever,
        private span: Span
    ) {
        super()
    }

    private performedSearch = new Set<string>()

    async execute(): Promise<ContextItem[]> {
        const queries = this.parse()
        this.content = ''
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
        // Limit the number of the new context items to 20 items to avoid long processing time
        // during the next thinking / reflection process.
        return context.slice(-20)
    }
}

export function getCodyTools(contextRetriever: ContextRetriever, span: Span): CodyTool[] {
    return [new SearchTool(contextRetriever, span), new CliTool(), new FileTool()]
}
