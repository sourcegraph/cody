import { truncateMultilineCompletion } from './multiline'
import { collapseDuplicativeWhitespace, trimUntilSuffix } from './text-processing'
import { Completion, PostProcessCompletionContext } from './types'
import { GenericLexem, parseLanguage, SupportedLanguage } from './utils/grammars'
import { createParser, ParserApi, Point, Tree } from './utils/lexical-analysis'

interface CompletionContext {
    prefix: string
    suffix: string
    languageId: string
    multiline: boolean
    completion: Completion
    withLexemeAnalysis?: boolean
}

/**
 * This function implements post-processing logic that is applied regardless of
 * which provider is chosen.
 */
export async function sharedPostProcess(context: CompletionContext): Promise<Completion> {
    const language = parseLanguage(context.languageId)
    const hasLexemAnalysisSupport = language !== null && context.withLexemeAnalysis

    const processor = combineProcessors([
        runIf(context.multiline, truncateMultilineCompletion),

        // Language specific post-processing, if we do completion
        // for language that we support in tree-sitter parsers we process them with
        // parsers specific flow
        runIf(hasLexemAnalysisSupport, runParserProcessors(language)),
        trimUntilSuffix,
        collapseDuplicativeWhitespace,
    ])

    const content = await processor(context.completion.content, {
        prefix: context.prefix,
        suffix: context.suffix,
        languageId: context.languageId,
    })

    return {
        ...context.completion,
        content: content.trimEnd(),
    }
}

type SyncProcessor<Context> = (completionContent: string, context: Context) => string
type AsyncProcessor<Context> = (completionContent: string, context: Context) => Promise<string>

type Processor<Context> = SyncProcessor<Context> | AsyncProcessor<Context>

function combineProcessors<Context>(processors: Processor<Context>[]): AsyncProcessor<Context> {
    return async (completionContent: string, context: Context) =>
        processors.reduce<Promise<string> | string>((content, processor) => {
            if (typeof content === 'string') {
                return processor(content, context)
            }

            return content.then(completion => processor(completion, context))
        }, completionContent)
}

function runIf<Context>(condition: boolean | undefined | null, processor: Processor<Context>): Processor<Context> {
    if (!condition) {
        return (completionContent: string) => completionContent
    }

    return processor
}

interface ParserProcessorContext {
    ast: Tree
    parser: ParserApi
    prefix: string
    suffix: string
    cursorPosition: Point
}

function runParserProcessors(language: SupportedLanguage | null): Processor<PostProcessCompletionContext> {
    return async (completion, context) => {
        const cursorPosition = positionFromPrefix(context.prefix)
        const parser = createParser({ language: language as SupportedLanguage })
        const parsedAST = await parser.parse(context.prefix + context.suffix)

        const processor = combineProcessors([trimByFunctionInvocation])

        return processor(completion, { ...context, cursorPosition, ast: parsedAST, parser })
    }
}

function trimByFunctionInvocation(completion: string, context: ParserProcessorContext): string {
    const cursorNode = context.ast.rootNode.descendantForPosition(context.cursorPosition)
    const closestArgumentNode = context.parser.findParentLexem(cursorNode, GenericLexem.Arguments)

    // Safe pass in case if we couldn't parse the snippet correctly
    if (closestArgumentNode === null || closestArgumentNode.hasError()) {
        return completion
    }

    const linesInArguments = Math.min(closestArgumentNode.endPosition.row - closestArgumentNode.startPosition.row, 1)

    return getFirstNLines(completion, linesInArguments)
}

function positionFromPrefix(prefix: string): Point {
    if (prefix.length === 0) {
        return { row: 0, column: 0 }
    }

    const lines = prefix.split('\n')
    const lastLine = lines[lines.length - 1]

    return { row: lines.length - 1, column: lastLine.length - 1 }
}

function getFirstNLines(string: string, n: number): string {
    const lines = string.split('\n')

    return lines.splice(0, n).join('\n')
}
