import type * as vscode from 'vscode'

import { renderMarkdown } from '../../common/markdown'
import { ide } from '../../ide'

import { CodyCompletionItemProvider } from '..'
import { isDefined } from '../../common'

import { ProvideInlineCompletionsItemTraceData } from '.'

/**
 * Registers a command `Cody: Open Autocomplete Trace View` that shows the context and prompt used
 * for autocomplete.
 */
export function registerAutocompleteTraceView(completionsProvider: CodyCompletionItemProvider): vscode.Disposable {
    let panel: vscode.WebviewPanel | null = null
    let latestInvocationSequence = 0

    return ide.Disposable.from(
        ide.commands.registerCommand('cody.autocomplete.openTraceView', () => {
            panel = ide.window.createWebviewPanel(
                'codyAutocompleteTraceView',
                'Cody Autocomplete Trace View',
                ide.ViewColumn.Two,
                {
                    enableFindWidget: true,
                }
            )
            panel.onDidDispose(() => {
                completionsProvider.setTracer(null)
                panel = null
            })

            panel.webview.html = renderWebviewHtml(undefined)

            completionsProvider.setTracer(data => {
                if (!panel) {
                    return
                }

                // Only show data from the latest invocation.
                if (data.invocationSequence > latestInvocationSequence) {
                    latestInvocationSequence = data.invocationSequence
                } else if (data.invocationSequence < latestInvocationSequence) {
                    return
                }

                panel.webview.html = renderWebviewHtml(data)
            })
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
        data ? null : 'Waiting for you to trigger a completion...',
        data?.params &&
            `
## Params

- ${markdownInlineCode(data.params.document.fileName)} @ ${data.params.position.line + 1}:${
                data.params.position.character + 1
            }
- selectedCompletionInfo: ${
                data.params.context.selectedCompletionInfo
                    ? selectedCompletionInfoDescription(
                          data.params.context.selectedCompletionInfo,
                          data.params.document
                      )
                    : 'none'
            }
`,
        data?.completers &&
            `
## Completers

${data.completers?.map(
    ({ id, prefix, suffix, ...otherOptions }) =>
        `
### ${id}

${codeDetailsWithSummary('Prefix', prefix, 'end')}
${codeDetailsWithSummary('Suffix', suffix, 'start')}

${markdownList(otherOptions)}
`
)}`,
        data?.context &&
            `
## Context

${markdownList(data.context.logSummary)}

${
    data.context.context.length === 0
        ? 'No context.'
        : data.context.context
              .map(({ content, fileName }) =>
                  codeDetailsWithSummary(`${fileName} (${content.length} chars)`, content, 'start')
              )
              .join('\n\n')
}
`,
        data?.result &&
            `
## Completions (cache ${data.cacheHit === true ? 'hit' : data.cacheHit === false ? 'miss' : 'unknown'})

${
    data.result.items.length === 0
        ? 'No completions.'
        : data.result.items
              .map(item => inlineCompletionItemDescription(item, data.params?.document))
              .join('\n\n---\n\n')
}`,

        data?.error &&
            `
## Error

${markdownCodeBlock(data.error)}
`,
        `
## Advanced tools

${codeDetailsWithSummary('JSON for dataset', jsonForDataset(data), 'start')}

`,
    ]
        .filter(isDefined)
        .map(s => s.trim())
        .join('\n\n---\n\n')

    return renderMarkdown(markdownSource, { noDomPurify: true })
}

function codeDetailsWithSummary(title: string, value: string, anchor: 'start' | 'end', excerptLength = 50): string {
    const excerpt = anchor === 'start' ? value.slice(0, excerptLength) : value.slice(-excerptLength)
    return `
<details>
<summary>${title}: <code>${anchor === 'end' ? '⋯' : ''}${withVisibleWhitespace(excerpt)
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')}${anchor === 'start' ? '⋯' : ''}</code></summary>

${markdownCodeBlock(value)}

</details>`
}

function markdownInlineCode(value: string): string {
    return '`' + value.replace(/`/g, '\\`') + '`'
}

function markdownCodeBlock(value: string): string {
    return '```\n' + value.replace(/`/g, '\\`') + '\n```\n'
}

function markdownList(object: { [key: string]: string | number | boolean }): string {
    return Object.keys(object)
        .sort()
        .map(key => `- ${key}: ${JSON.stringify(object[key as keyof typeof object])}`)
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
    item: vscode.InlineCompletionItem,
    document: vscode.TextDocument | undefined
): string {
    return `${markdownCodeBlock(
        withVisibleWhitespace(typeof item.insertText === 'string' ? item.insertText : item.insertText.value)
    )}
${item.range ? `replacing ${rangeDescriptionWithCurrentText(item.range, document)}` : 'inserting at cursor'}`
}

function rangeDescription(range: vscode.Range): string {
    // The VS Code extension API uses 0-indexed lines and columns, but the UI (and humans) use
    // 1-indexed lines and columns. Show the latter.
    return `${range.start.line + 1}:${range.start.character + 1}${
        range.isEmpty
            ? ''
            : `-${range.end.line !== range.start.line ? `${range.end.line + 1}:` : ''}${range.end.character + 1}`
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
    return text.replace(/ /g, '·').replace(/\t/g, '⇥').replace(/\r?\n/g, '↵')
}

function jsonForDataset(data: ProvideInlineCompletionsItemTraceData | undefined): string {
    const completer = data?.completers?.[0]

    if (!completer) {
        return ''
    }

    return `{
        context: ${JSON.stringify(data?.context?.context.map(c => ({ fileName: c.fileName, content: c.content })))},
        fileName: ${JSON.stringify(completer.fileName)},
        languageId: ${JSON.stringify(completer.languageId)},
        content: \`${completer.prefix}$\{CURSOR}${completer.suffix}\`,
    }`
}
