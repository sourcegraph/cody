import type { Code, Root } from 'mdast'
import type { Plugin } from 'unified'
import { visit } from 'unist-util-visit'

interface CodeNodeData {
    hProperties?: {
        'data-file-path'?: string
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
 * ```typescript:path/to/file.ts
 * console.log()
 * ```
 * becomes ->
 * <code data-file-path="path/to/file.ts">
 * console.log()
 * </code>
 */
export const remarkAttachFilePathToCodeBlocks: Plugin<[], Root> = () => {
    return (tree: Root) => {
        visit(tree, 'code', (node: Code) => {
            const match = node.lang?.match(LANG_FILE_PATH_REGEX)
            if (match) {
                const [, language, filePath] = match

                // Update the node's lang to remove the file path
                node.lang = language

                // Update node data
                node.data = {
                    ...node.data,
                    hProperties: {
                        ...(node.data as CodeNodeData)?.hProperties,
                        'data-file-path': filePath.trim(),
                    },
                }
            }
        })
    }
}
