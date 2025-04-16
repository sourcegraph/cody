import type { Guardrails } from '@sourcegraph/cody-shared'
import { clsx } from 'clsx'
import type { Code, Root } from 'mdast'
import type React from 'react'
import type { Plugin } from 'unified'
import { visit } from 'unist-util-visit'
import type { CodeBlockActionsProps } from '../chat/ChatMessageContent/ChatMessageContent'
import { MarkdownFromCody } from './MarkdownFromCody'
import { RichCodeBlock } from './RichCodeBlock'

interface RichMarkdownProps {
    markdown: string
    isLoading?: boolean
    // The code blocks that are being regenerated by the user. Used to show a generating code indicator for these blocks.
    regeneratingCodeBlocks: Set<string>
    guardrails: Guardrails
    onCopy?: (code: string) => void
    onInsert?: (code: string, newFile?: boolean) => void
    onExecute?: (command: string) => void
    onRegenerate?: (code: string, language: string | undefined) => void
    smartApply?: CodeBlockActionsProps['smartApply']
    className?: string
    hasEditIntent: boolean
}

interface TerminatedCodeData {
    hProperties?: {
        // Whether the code block has been output completely. The processor is
        // always fed markdown with terminators (```) so we instead check to see
        // if the terminator is at the end of the file. Hence, this will be true
        // when the block is definitely complete, but it may return false for
        // blocks at the end of the generated output. You must combine this flag
        // with an indicator for whether the whole response is complete.
        'data-is-code-complete': boolean
        // The markdown source of the block, including the ``` fences, language
        // and filename specifier, etc.
        'data-source-text': string
        // This is provided by the remarkAttachFilePathToCodeBlocks plugin, but
        // we mention it here for convenience reading it later.
        'data-file-path': string
        // This is provided by the remarkAttachFilePathToCodeBlocks plugin, but
        // we mention it here for convenience reading it later.
        'data-language': string
    }
}

export const remarkAttachCompletedCodeBlocks: Plugin<[], Root> = () => {
    return (tree: Root, file) => {
        visit(tree, 'code', (node: Code) => {
            const sourceText = file.value
                .slice(node.position?.start.offset, node.position?.end.offset)
                .toString()
            const isComplete = (node.position?.end.offset ?? 0) < file.value.length
            node.data = {
                ...node.data,
                hProperties: {
                    ...(node.data as TerminatedCodeData)?.hProperties,
                    'data-is-code-complete': isComplete,
                    'data-source-text': sourceText,
                },
            } as TerminatedCodeData
        })
    }
}

/**
 * RichMarkdown renders markdown content with enhanced code blocks.
 * It customizes the markdown renderer to use RichCodeBlock for code blocks,
 * which provides syntax highlighting, action buttons, and optional guardrails
 * protection.
 */
export const RichMarkdown: React.FC<RichMarkdownProps> = ({
    markdown,
    isLoading = false,
    regeneratingCodeBlocks,
    guardrails,
    onCopy,
    onInsert,
    onExecute,
    onRegenerate,
    smartApply,
    className,
    hasEditIntent,
}) => {
    // Handle rendering of code blocks with our custom RichCodeBlock component
    const components = {
        pre({ node, inline, className, children, ...props }: any) {
            // Don't process inline code blocks
            if (inline) {
                return (
                    <code className={className} {...props}>
                        {children}
                    </code>
                )
            }

            // Get the code node (if it exists)
            const codeNode =
                node.children.length === 1 && node.children[0].type === 'element'
                    ? node.children[0]
                    : null

            // Get the cached highlighting result (if there is a key, and if the result is cached)
            const {
                'data-source-text': sourceText,
                'data-is-code-complete': isThisBlockComplete,
                'data-file-path': filePath,
                'data-language': language,
            } = (codeNode?.properties as TerminatedCodeData['hProperties'] | undefined) || {
                'data-is-code-complete': false,
            }

            const plainText = sourceText ?? ''

            // Determine if this is a shell command
            const isShellCommand = language === 'bash' || language === 'sh'

            // Render with our RichCodeBlock component
            return (
                <RichCodeBlock
                    hasEditIntent={hasEditIntent}
                    code={plainText}
                    language={language}
                    fileName={filePath}
                    isCodeComplete={
                        !regeneratingCodeBlocks.has(plainText) && (isThisBlockComplete || !isLoading)
                    }
                    isShellCommand={isShellCommand}
                    guardrails={guardrails}
                    onCopy={onCopy}
                    onInsert={onInsert}
                    onExecute={isShellCommand ? onExecute : undefined}
                    onRegenerate={onRegenerate}
                    smartApply={smartApply}
                >
                    {children}
                </RichCodeBlock>
            )
        },
    }

    return (
        <div className={clsx('markdown-content', className)}>
            <MarkdownFromCody
                components={components}
                prefixRemarkPlugins={[remarkAttachCompletedCodeBlocks]}
            >
                {markdown}
            </MarkdownFromCody>
        </div>
    )
}
