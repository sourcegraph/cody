import type { Code, Root } from 'mdast'
import type { Plugin } from 'unified'
import { visit } from 'unist-util-visit'

interface CodeNodeData {
    hProperties?: {
        'data-file-path'?: string
    }
}

export const remarkExtractCodeBlocks: Plugin<[], Root, Root> = () => {
    return (tree: Root) => {
        visit(tree, 'code', (node: Code) => {
            const match = node.lang?.match(/^(\w+):(.+)$/)
            if (match) {
                const [, language, filePath] = match

                // Update the node's lang to remove the file path
                node.lang = language

                // Ensure node.data exists and has the correct type
                const nodeData = (node.data || {}) as CodeNodeData
                nodeData.hProperties = {
                    ...nodeData.hProperties,
                    'data-file-path': filePath.trim(),
                }
                node.data = nodeData
            }
        })
    }
}
