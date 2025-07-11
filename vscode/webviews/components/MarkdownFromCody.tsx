import { CodyIDE } from '@sourcegraph/cody-shared'
import type { ComponentProps, FunctionComponent } from 'react'
import { memo, useMemo } from 'react'
import Markdown, { defaultUrlTransform } from 'react-markdown'
import type { Components, UrlTransform } from 'react-markdown/lib'

import rehypeSanitize, { type Options as RehypeSanitizeOptions, defaultSchema } from 'rehype-sanitize'
import remarkGFM from 'remark-gfm'
import type { Pluggable } from 'unified/lib'
import { remarkAttachFilePathToCodeBlocks } from '../chat/extract-file-path'
import { SYNTAX_HIGHLIGHTING_LANGUAGES } from '../utils/highlight'
import { useConfig } from '../utils/useConfig'
import { CustomHJSHighlighter } from './CustomHJSHighlighter'

/**
 * Supported URIs to render as links in outputted markdown.
 * - https?: Web
 * - file: local file scheme
 * - vscode: VS Code URL scheme (open in editor)
 * - command:cody. VS Code command scheme for cody (run command)
 * {@link CODY_PASSTHROUGH_VSCODE_OPEN_COMMAND_ID}
 */
const ALLOWED_URI_REGEXP = /^((https?|file|vscode):\/\/[^\s#$./?].\S*$|(command:_?cody.*))/i

const ALLOWED_ELEMENTS = [
    'p',
    'div',
    'span',
    'pre',
    'i',
    'em',
    'b',
    'strong',
    'code',
    'pre',
    'kbd',
    'blockquote',
    'ul',
    'li',
    'ol',
    'a',
    'table',
    'tr',
    'th',
    'td',
    'thead',
    'tbody',
    'tfoot',
    's',
    'u',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'br',
    'think',
]

function defaultUrlProcessor(url: string): string {
    const processedURL = defaultUrlTransform(url)

    if (!ALLOWED_URI_REGEXP.test(processedURL)) {
        return ''
    }

    return processedURL
}

/**
 * Transform URLs to opens links in assistant responses using the `_cody.vscode.open` command.
 */
function wrapLinksWithCodyOpenCommand(url: string): string {
    url = defaultUrlTransform(url)
    if (!ALLOWED_URI_REGEXP.test(url)) {
        return ''
    }
    const encodedURL = encodeURIComponent(JSON.stringify(url))
    return `command:_cody.vscode.open?${encodedURL}`
}

const URL_PROCESSORS: Partial<Record<CodyIDE, UrlTransform>> = {
    [CodyIDE.VSCode]: wrapLinksWithCodyOpenCommand,
}

/**
 * Transforms the children string by wrapping it in one extra backtick if we find '````markdown'.
 * This is used to preserve the formatting of Markdown code blocks within the Markdown content.
 * Such cases happen when you ask Cody to create a Markdown file or when you load a history chat
 * that contains replies for creating Markdown files.
 *
 * @param children - The string to transform.
 * @returns The transformed string.
 */
const childrenTransform = (children: string): string => {
    if (children.indexOf('```markdown') === -1) {
        return children
    }
    children = children.replace('```markdown', '````markdown')
    const lastIdx = children.lastIndexOf('```')

    // Replace the last three backticks with four backticks
    return children.slice(0, lastIdx) + '````' + children.slice(lastIdx + 3)
}

const _markdownPluginProps: Pick<ComponentProps<typeof Markdown>, 'rehypePlugins' | 'remarkPlugins'> = {
    rehypePlugins: [
        [
            rehypeSanitize,
            {
                ...defaultSchema,
                tagNames: ALLOWED_ELEMENTS,
                attributes: {
                    ...defaultSchema.attributes,
                    code: [
                        ...(defaultSchema.attributes?.code || []),
                        // Allow various metadata attributes for code blocks
                        ['data-file-path'],
                        ['data-is-code-complete'],
                        ['data-language'],
                        ['data-source-text'],
                        [
                            'className',
                            ...Object.keys(SYNTAX_HIGHLIGHTING_LANGUAGES).map(
                                language => `language-${language}`
                            ),
                        ],
                    ],
                },
            } satisfies RehypeSanitizeOptions,
        ],
    ],
    remarkPlugins: [remarkGFM, remarkAttachFilePathToCodeBlocks],
}

export const MarkdownFromCody: FunctionComponent<{
    className?: string
    prefixRemarkPlugins?: Pluggable[]
    components?: Partial<Components>
    children: string
}> = memo(({ className, children, components }) => {
    const clientType = useConfig().clientCapabilities.agentIDE
    const urlTransform = useMemo(() => URL_PROCESSORS[clientType] ?? defaultUrlProcessor, [clientType])
    const chatReplyTransformed = useMemo(() => childrenTransform(children), [children])

    const markdownComponents = useMemo(
        () =>
            ({
                ...components,
                code: ({ node, className, children, ...props }: any) => {
                    const match = /language-(\w+)/.exec(className || '')
                    const language = match ? match[1] : undefined
                    const code = String(children).replace(/\n$/, '')

                    if (!language) {
                        return (
                            <code className={className} {...props}>
                                {children}
                            </code>
                        )
                    }

                    return <CustomHJSHighlighter code={code} language={language} className={className} />
                },
            }) as Partial<Components>,
        [components]
    )

    return (
        <div className={className}>
            <Markdown
                {..._markdownPluginProps}
                urlTransform={urlTransform}
                components={markdownComponents}
            >
                {chatReplyTransformed}
            </Markdown>
        </div>
    )
})

MarkdownFromCody.displayName = 'MarkdownFromCody'
