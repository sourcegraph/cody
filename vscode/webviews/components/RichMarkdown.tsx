import type { Guardrails } from '@sourcegraph/cody-shared'
import { clsx } from 'clsx'
import { LRUCache } from 'lru-cache'
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
    guardrails: Guardrails
    onCopy?: (code: string) => void
    onInsert?: (code: string, newFile?: boolean) => void
    onExecute?: (command: string) => void
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

const highlightedMarkdownCache = new LRUCache<
    string,
    {
        language: string | undefined
        highlightedHtml: string
        plainText: string
    }
>({
    max: 100,
})

/**
 * RichMarkdown renders markdown content with enhanced code blocks.
 * It customizes the markdown renderer to use RichCodeBlock for code blocks,
 * which provides syntax highlighting, action buttons, and optional guardrails
 * protection.
 */
export const RichMarkdown: React.FC<RichMarkdownProps> = ({
    markdown,
    isLoading = false,
    guardrails,
    onCopy,
    onInsert,
    onExecute,
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
                'data-source-text': cacheKey,
                'data-is-code-complete': isThisBlockComplete,
                'data-file-path': filePath,
                'data-language': language,
            } = (codeNode?.properties as TerminatedCodeData['hProperties'] | undefined) || {
                'data-is-code-complete': false,
            }
            let cached = cacheKey && highlightedMarkdownCache.get(cacheKey)

            if (!cached) {
                try {
                    // First get the raw text content (for copying and executing)
                    const extractText = (node: any): string => {
                        if (typeof node === 'string') return node
                        if (!node) return ''
                        if (node.type === 'text' && node.value) return node.value
                        if (node.children) {
                            return node.children.map(extractText).join('')
                        }
                        return ''
                    }
                    const plainText = extractText(node)

                    // Then get the HTML content with syntax highlighting already applied by rehype-highlight
                    const highlightedHtml = node.children
                        ? node.children
                              .map((child: any) => {
                                  // Handle direct string nodes (shouldn't happen at this level, but just in case)
                                  if (typeof child === 'string') return child

                                  // Handle text nodes (like punctuation characters)
                                  if (child.type === 'text' && child.value) {
                                      return child.value
                                  }

                                  // This is where the magic happens - rehype-highlight has already
                                  // processed this code and added span elements with class names
                                  // for syntax highlighting
                                  if (child.type === 'element' && child.properties) {
                                      const childProps = child.properties
                                      const childChildren = child.children

                                      if (childChildren) {
                                          // Recursively extract content from child nodes
                                          const processNode = (node: any): string => {
                                              // Handle string literals
                                              if (typeof node === 'string') return node

                                              // Handle null/undefined
                                              if (!node) return ''

                                              // Handle text nodes (like punctuation symbols)
                                              if (node.type === 'text' && node.value) {
                                                  return node.value
                                              }

                                              // Handle element nodes
                                              if (node.type === 'element' && node.properties) {
                                                  const props = node.properties
                                                  const className =
                                                      typeof props.className === 'string'
                                                          ? props.className
                                                          : Array.isArray(props.className)
                                                            ? props.className.join(' ')
                                                            : ''

                                                  // TODO: What security guarantees does rehype/sanitize provide here?
                                                  // How does this compare to origin/main?
                                                  if (node.children) {
                                                      const content = node.children
                                                          .map(processNode)
                                                          .join('')
                                                      return `<span class="${className}">${content}</span>`
                                                  }

                                                  return `<span class="${className}"></span>`
                                              }

                                              // Fallback for any other node type
                                              if (node.value) return node.value
                                              if (node.children) {
                                                  return node.children.map(processNode).join('')
                                              }

                                              return ''
                                          }

                                          const childContent = childChildren.map(processNode).join('')

                                          const className =
                                              typeof childProps.className === 'string'
                                                  ? childProps.className
                                                  : Array.isArray(childProps.className)
                                                    ? childProps.className.join(' ')
                                                    : ''

                                          return `<span class="${className}">${childContent}</span>`
                                      }
                                  }

                                  // Handle any other node type
                                  if (child.value) return child.value
                                  if (child.children) {
                                      return child.children
                                          .map((c: any) => {
                                              if (typeof c === 'string') return c
                                              if (c.value) return c.value
                                              return ''
                                          })
                                          .join('')
                                  }

                                  return ''
                              })
                              .join('')
                        : plainText // TODO: we need to HTML escape this plainText

                    cached = {
                        language,
                        highlightedHtml,
                        plainText,
                    }

                    if (cacheKey && isThisBlockComplete) {
                        highlightedMarkdownCache.set(cacheKey, cached)
                    }
                } catch (error) {
                    // Fallback to simple code display if there's an error
                    console.error('Error processing code block:', error)
                    const fallbackCode = String(children).replace(/\n$/, '')
                    const fallbackLanguage = className?.replace(/language-/, '') || undefined

                    return guardrails.shouldHideCodeBeforeAttribution ? (
                        <pre>Error processing code block.</pre>
                    ) : (
                        <pre>
                            <code className={clsx(fallbackLanguage && `language-${fallbackLanguage}`)}>
                                {fallbackCode}
                            </code>
                        </pre>
                    )
                }
            }

            // Determine if this is a shell command
            const isShellCommand = cached.language === 'bash' || cached.language === 'sh'

            // Render with our RichCodeBlock component
            return (
                <RichCodeBlock
                    hasEditIntent={hasEditIntent}
                    code={cached.plainText}
                    language={cached.language}
                    fileName={filePath}
                    isCodeComplete={isThisBlockComplete || !isLoading}
                    isShellCommand={isShellCommand}
                    guardrails={guardrails}
                    onCopy={onCopy}
                    onInsert={onInsert}
                    onExecute={isShellCommand ? onExecute : undefined}
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
