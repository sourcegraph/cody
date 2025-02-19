import type { Code, Root } from 'mdast'
import type { Plugin } from 'unified'
import { visit } from 'unist-util-visit'

interface CodeNodeData {
    hProperties?: {
        'data-file-path'?: string
        regex?: string
    }
}

const LANG_FILE_PATH_REGEX = /^(\w+):(.+)$/

/**
 * Given a Markdown code block, inspect the `lang` property to determine if we can also extract
 * the file path for this code.
 *
 * Attaches mentioned file path to the element as a `data-file-path` attribute, so it can be easily
 * read later in the code.
 *
 * Example:
 * ```typescript:path/to/file.ts regex:"^(\w+):(.+)$
 * console.log()
 * ```
 * becomes ->
 * <code data-file-path="path/to/file.ts" regex="^(\w+):(.+)$">
 * console.log()
 * </code>
 */
export const remarkAttachFilePathToCodeBlocks: Plugin<[], Root> = () => {
    return (tree: Root) => {
        visit(tree, 'code', (node: Code) => {
            const match = node.lang?.match(LANG_FILE_PATH_REGEX)
            if (match) {
                const [, language, filePath] = match

                node.lang = language

                const hProperties: CodeNodeData['hProperties'] = {
                    ...(node.data as CodeNodeData)?.hProperties,
                    // We sanitize spaces in markdown path files using `PromptString` class, now we can convert them back
                    'data-file-path': filePath.trim().replaceAll('%20', ' '),
                }

                if (node.meta?.startsWith('regex=') || node.meta?.startsWith('v')) {
                    const rawRegex = node.meta.replace('regex=', '').trim()
                    hProperties.regex = node.meta === 'v0' ? '.*' : rawRegex
                }

                // Update node data
                node.data = {
                    ...node.data,
                    hProperties,
                }
            }
        })
    }
}
