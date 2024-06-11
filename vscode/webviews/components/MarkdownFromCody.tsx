import { all } from 'lowlight'
import type { ComponentProps, FunctionComponent } from 'react'
import Markdown, { defaultUrlTransform } from 'react-markdown'
import rehypeHighlight, { type Options as RehypeHighlightOptions } from 'rehype-highlight'
import rehypeSanitize, { type Options as RehypeSanitizeOptions, defaultSchema } from 'rehype-sanitize'
import remarkGFM from 'remark-gfm'

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
]

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

export const MarkdownFromCody: FunctionComponent<{ className?: string; children: string }> = ({
    className,
    children,
}) => (
    <Markdown
        className={className}
        {...markdownPluginProps()}
        urlTransform={wrapLinksWithCodyOpenCommand}
    >
        {children}
    </Markdown>
)

let _markdownPluginProps: ReturnType<typeof markdownPluginProps> | undefined
function markdownPluginProps(): Pick<
    ComponentProps<typeof Markdown>,
    'rehypePlugins' | 'remarkPlugins'
> {
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
                            ['className', ...LANGUAGES.map(language => `language-${language}`)],
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
                    languages: Object.fromEntries(
                        Object.entries(all).filter(([language]) => LANGUAGES.includes(language))
                    ),

                    // `ignoreMissing: true` is required to avoid errors when trying to highlight
                    // partial code blocks received from the LLM that have (e.g.) "```p" for
                    // "```python". This is only needed on rehype-highlight@^6.0.0, which we needed
                    // to downgrade to in order to avoid a memory leak
                    // (https://github.com/remarkjs/react-markdown/issues/791).
                    ignoreMissing: true,
                } satisfies RehypeHighlightOptions & { ignoreMissing: boolean },
            ],
        ],
        remarkPlugins: [remarkGFM],
    }
    return _markdownPluginProps
}

const LANGUAGES = [
    'apex',
    'bash',
    'c',
    'clojure',
    'cpp',
    'cpp',
    'cs',
    'csharp',
    'css',
    'dart',
    'diff',
    'diff',
    'dockerfile',
    'dockerfile',
    'elixir',
    'fortran',
    'go',
    'graphql',
    'groovy',
    'haskell',
    'html',
    'http',
    'java',
    'javascript',
    'json',
    'jsonc',
    'kotlin',
    'lua',
    'markdown',
    'matlab',
    'nix',
    'objectivec',
    'ocaml',
    'perl',
    'php',
    'python',
    'r',
    'ruby',
    'rust',
    'scala',
    'sql',
    'swift',
    'typescript',
    'verilog',
    'vhdl',
    'yaml',
]
