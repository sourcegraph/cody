import { CodyIDE } from '@sourcegraph/cody-shared'
import type { ComponentProps, FunctionComponent } from 'react'
import { useMemo } from 'react'
import Markdown, { defaultUrlTransform } from 'react-markdown'
import type { Components, UrlTransform } from 'react-markdown/lib'
import rehypeHighlight, { type Options as RehypeHighlightOptions } from 'rehype-highlight'
import rehypeSanitize, { type Options as RehypeSanitizeOptions, defaultSchema } from 'rehype-sanitize'
import remarkGFM from 'remark-gfm'
import type { Pluggable } from 'unified/lib'
import { remarkAttachFilePathToCodeBlocks } from '../chat/extract-file-path'
import { SYNTAX_HIGHLIGHTING_LANGUAGES } from '../utils/highlight'
import { useConfig } from '../utils/useConfig'

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
 * Transforms the children string by wrapping it in one extra backtick if we find '```markdown'.
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

export const MarkdownFromCody: FunctionComponent<{
    className?: string
    prefixRemarkPlugins?: Pluggable[]
    components?: Partial<Components>
    children: string
}> = ({ className, prefixRemarkPlugins, components, children }) => {
    const clientType = useConfig().clientCapabilities.agentIDE
    const urlTransform = useMemo(() => URL_PROCESSORS[clientType] ?? defaultUrlProcessor, [clientType])
    const chatReplyTransformed = childrenTransform(children)

    return (
        <Markdown
            className={className}
            {...markdownPluginProps(prefixRemarkPlugins ?? [])}
            urlTransform={urlTransform}
            components={components ?? {}}
        >
            {chatReplyTransformed}
        </Markdown>
    )
}

let _markdownPluginProps: ReturnType<typeof markdownPluginProps> | undefined
function markdownPluginProps(
    prefixRemarkPlugins: Pluggable[] = []
): Pick<ComponentProps<typeof Markdown>, 'rehypePlugins' | 'remarkPlugins'> {
    if (_markdownPluginProps) {
        return _markdownPluginProps
    }

    _markdownPluginProps = {
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
            [
                // HACK(sqs): Need to use rehype-highlight@^6.0.0 to avoid a memory leak
                // (https://github.com/remarkjs/react-markdown/issues/791), but the types are
                // slightly off.
                rehypeHighlight as any,
                {
                    detect: true,
                    languages: {
                        ...SYNTAX_HIGHLIGHTING_LANGUAGES,
                    },

                    // `ignoreMissing: true` is required to avoid errors when trying to highlight
                    // partial code blocks received from the LLM that have (e.g.) "```p" for
                    // "```python". This is only needed on rehype-highlight@^6.0.0, which we needed
                    // to downgrade to in order to avoid a memory leak
                    // (https://github.com/remarkjs/react-markdown/issues/791).
                    ignoreMissing: true,
                } satisfies RehypeHighlightOptions & { ignoreMissing: boolean },
            ],
        ],
        remarkPlugins: [...prefixRemarkPlugins, remarkGFM, remarkAttachFilePathToCodeBlocks],
    }
    return _markdownPluginProps
}
