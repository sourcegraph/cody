import type { Code, Root } from 'mdast'
import type { Plugin } from 'unified'
import { visit } from 'unist-util-visit'

export const remarkExtractCodeBlocks: Plugin<[], Root, Root> = () => {
    return (tree, file) => {
        visit(tree, 'code', (node: Code) => {
            console.log('VISITING CODE NODE', node)
            const match = node.lang?.match(/^(\w+):(.+)$/)
            if (match) {
                // Update the node's lang to remove the file path
                node.lang = match[1]

                if (node.data) {
                    node.data.hProperties = { ...node.data.hProperties, 'data-file-path': match[2] }
                } else {
                    node.data = { hProperties: { 'data-file-path': match[2] } }
                }
            }
        })
    }
}
