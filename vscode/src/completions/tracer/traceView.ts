import * as vscode from 'vscode'

import { isDefined } from '@sourcegraph/cody-shared'
import { renderMarkdown } from '@sourcegraph/cody-shared/src/common/markdown'

import {
    registerDebugListener as registerSectionObserverDebugListener,
    SectionHistoryRetriever,
} from '../context/retrievers/section-history/section-history-retriever'
import { InlineCompletionsResultSource } from '../get-inline-completions'
import { InlineCompletionItemProvider } from '../inline-completion-item-provider'
import * as statistics from '../statistics'
import { InlineCompletionItem } from '../types'

import { ProvideInlineCompletionsItemTraceData } from '.'

/**
 * Registers a command `Cody: Open Autocomplete Trace View` that shows the context and prompt used
 * for autocomplete.
 */
export function registerAutocompleteTraceView(provider: InlineCompletionItemProvider): vscode.Disposable {
    let panel: vscode.WebviewPanel | null = null
    let latestInvocationSequence = 0

    return vscode.Disposable.from(
        vscode.commands.registerCommand('cody.autocomplete.openTraceView', () => {
            panel = vscode.window.createWebviewPanel(
                'codyAutocompleteTraceView',
                'Cody Autocomplete Trace View',
                vscode.ViewColumn.Two,
                {
                    enableFindWidget: true,
                }
            )
            panel.onDidDispose(() => {
                provider.setTracer(null)
                panel = null
            })

            let data: ProvideInlineCompletionsItemTraceData | undefined
            function rerender(): void {
                if (!panel) {
                    return
                }

                if (!data) {
                    panel.webview.html = renderWebviewHtml(data)
                    return
                }

                //  Only show data from the latest invocation.
                if (data.invocationSequence > latestInvocationSequence) {
                    latestInvocationSequence = data.invocationSequence
                } else if (data.invocationSequence < latestInvocationSequence) {
                    return
                }

                panel.webview.html = renderWebviewHtml(data)
            }
            rerender()

            const unsubscribeStatistics = statistics.registerChangeListener(rerender)
            const unsubscribeSectionObserver = registerSectionObserverDebugListener(rerender)

            provider.setTracer(_data => {
                data = _data
                rerender()
            })

            return {
                dispose: () => {
                    unsubscribeStatistics()
                    unsubscribeSectionObserver()
                },
            }
        }),
        {
            dispose() {
                if (panel) {
                    panel.dispose()
                    panel = null
                }
            },
        }
    )
}

function renderWebviewHtml(data: ProvideInlineCompletionsItemTraceData | undefined): string {
    const markdownSource = [
        `# Cody autocomplete trace view${data ? ` (#${data.invocationSequence})` : ''}`,
        statisticSummary(),
        data ? null : 'Waiting for you to trigger a completion...',
        data?.params &&
            `
## Params

- ${markdownInlineCode(vscode.workspace.asRelativePath(data.params.document.fileName))} @ ${
                data.params.position.line + 1
            }:${data.params.position.character + 1}
- triggerKind: ${data.params.triggerKind}
- selectedCompletionInfo: ${
                data.params.selectedCompletionInfo
                    ? selectedCompletionInfoDescription(data.params.selectedCompletionInfo, data.params.document)
                    : 'none'
            }
`,
        data?.completers &&
            `
## Completers

${data.completers?.map(
    ({ id, docContext: { prefix, suffix, completionIntent }, position, document, ...otherOptions }) =>
        `
### ${id}

${codeDetailsWithSummary('Prefix', prefix, 'end')}
${codeDetailsWithSummary('Suffix', suffix, 'start')}

${markdownList({ ...otherOptions, completionIntent: completionIntent || 'unknown' })}
`
)}`,
        data?.context === undefined
            ? ''
            : `
## Context

${data.context ? markdownList(data.context.logSummary) : ''}

${
    data.context === null || data.context.context.length === 0
        ? 'No context.'
        : data.context.context
              .map(contextSnippet =>
                  codeDetailsWithSummary(
                      `${contextSnippet.fileName}${'symbol' in contextSnippet ? `#${contextSnippet.symbol}` : ''} (${
                          contextSnippet.content.length
                      } chars)`,
                      contextSnippet.content,
                      'start'
                  )
              )
              .join('\n\n')
}
`,
        data?.completionProviderCallParams &&
            `
## Completion provider calls

${codeDetailsWithSummary('Params', JSON.stringify(data.completionProviderCallParams, null, 2))}

${
    data.completionProviderCallResult
        ? codeDetailsWithSummary('Result', JSON.stringify(data.completionProviderCallResult, null, 2))
        : '_Loading result..._'
}

`,
        data?.result === undefined
            ? ''
            : `
## Completions

${(data.result
    ? [`- source: ${InlineCompletionsResultSource[data.result.source]}`, `- logId: \`${data.result.logId}\``]
    : []
).join('\n')}

${
    data.result === null
        ? '`null`'
        : data.result.items.length === 0
        ? 'Empty completions.'
        : data.result.items
              .map(item => inlineCompletionItemDescription(item, data.params?.document))
              .join('\n\n---\n\n')
}`,

        data?.error &&
            `
## Error

${markdownCodeBlock(data.error)}
`,
        SectionHistoryRetriever.instance
            ? `
## Document sections

${documentSections()}`
            : '',

        `
## Advanced tools

${codeDetailsWithSummary('JSON for dataset', jsonForDataset(data))}

`,
    ]
        .filter(isDefined)
        .filter(s => s !== '')
        .map(s => s.trim())
        .join('\n\n---\n\n')

    return renderMarkdown(markdownSource, { noDomPurify: true })
}

function statisticSummary(): string {
    const { accepted, suggested } = statistics.getStatistics()
    return `📈 Suggested: ${suggested} | Accepted: ${accepted} | Acceptance rate: ${
        suggested === 0 ? 'N/A' : `${((accepted / suggested) * 100).toFixed(2)}%`
    }`
}

function documentSections(): string {
    if (!SectionHistoryRetriever.instance) {
        return ''
    }
    return `\`\`\`\n${SectionHistoryRetriever.instance.debugPrint()}\n\`\`\``
}

function codeDetailsWithSummary(
    title: string,
    value: string,
    anchor: 'start' | 'end' | 'none' = 'none',
    excerptLength = 50
): string {
    const excerpt =
        anchor === 'start' ? value.slice(0, excerptLength) : anchor === 'end' ? value.slice(-excerptLength) : null
    const excerptMarkdown =
        excerpt === null
            ? ''
            : `: <code>${anchor === 'end' ? '⋯' : ''}${withVisibleWhitespace(excerpt)
                  .replaceAll('<', '&lt;')
                  .replaceAll('>', '&gt;')}${anchor === 'start' ? '⋯' : ''}</code>`
    return `
<details>
<summary>${title}${excerptMarkdown}</summary>

${markdownCodeBlock(value)}

</details>`
}

function markdownInlineCode(value: string): string {
    return '`' + value.replaceAll('`', '\\`') + '`'
}

function markdownCodeBlock(value: string): string {
    return '```\n' + value.replaceAll('`', '\\`') + '\n```\n'
}

function markdownList(object: { [key: string]: any }): string {
    return Object.keys(object)
        .sort()
        .map(key => `- ${key}: ${JSON.stringify(object[key as keyof typeof object], null, 2)}`)
        .join('\n')
}

function selectedCompletionInfoDescription(
    { range, text }: NonNullable<vscode.InlineCompletionContext['selectedCompletionInfo']>,
    document: vscode.TextDocument
): string {
    return `${markdownInlineCode(withVisibleWhitespace(text))}, replacing ${rangeDescriptionWithCurrentText(
        range,
        document
    )}`
}

function inlineCompletionItemDescription(
    item: InlineCompletionItem,
    document: vscode.TextDocument | undefined
): string {
    return `${markdownCodeBlock(withVisibleWhitespace(item.insertText))}
${
    item.range
        ? `replacing ${rangeDescriptionWithCurrentText(
              new vscode.Range(
                  item.range.start.line,
                  item.range.start.character,
                  item.range.end.line,
                  item.range.end.character
              ),
              document
          )}`
        : 'inserting at cursor'
}`
}

function rangeDescription(range: vscode.Range): string {
    // The VS Code extension API uses 0-indexed lines and columns, but the UI (and humans) use
    // 1-indexed lines and columns. Show the latter.
    return `${range.start.line + 1}:${range.start.character + 1}${
        range.isEmpty
            ? ''
            : `-${range.end.line === range.start.line ? '' : `${range.end.line + 1}:`}${range.end.character + 1}`
    }`
}

function rangeDescriptionWithCurrentText(range: vscode.Range, document?: vscode.TextDocument): string {
    return `${rangeDescription(range)} (${
        range.isEmpty
            ? 'empty'
            : document
            ? markdownInlineCode(withVisibleWhitespace(document.getText(range)))
            : 'unknown replacement text'
    })`
}

function withVisibleWhitespace(text: string): string {
    return text.replaceAll(' ', '·').replaceAll('\t', '⇥').replaceAll(/\r?\n/g, '↵')
}

function jsonForDataset(data: ProvideInlineCompletionsItemTraceData | undefined): string {
    const completer = data?.completers?.[0]

    if (!completer) {
        return ''
    }

    return `{
        context: ${JSON.stringify(data?.context?.context.map(c => ({ fileName: c.fileName, content: c.content })))},
        fileName: ${JSON.stringify(vscode.workspace.asRelativePath(completer.document.fileName))},
        languageId: ${JSON.stringify(completer.document.languageId)},
        content: \`${completer.docContext.prefix}$\{CURSOR}${completer.docContext.suffix}\`,
    }`
}
