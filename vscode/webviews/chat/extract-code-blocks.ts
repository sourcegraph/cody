import type { Code, Root } from 'mdast'
import type { Plugin } from 'unified'
import { visit } from 'unist-util-visit'

export interface ExtractedCodeBlock {
    language: string
    filePath: string
    code: string
}

export interface RemarkExtractCodeBlocksResult {
    codeBlocks: ExtractedCodeBlock[]
}

export const remarkExtractCodeBlocks: Plugin<[], Root, Root> = () => {
    return (tree, file) => {
        const codeBlocks: ExtractedCodeBlock[] = []

        visit(tree, 'code', (node: Code) => {
            console.log('VISITING CODE NODE', node)
            const match = node.lang?.match(/^(\w+):(.+)$/)
            if (match) {
                codeBlocks.push({
                    language: match[1],
                    filePath: match[2],
                    code: node.value,
                })
                // Update the node's lang to remove the file path
                node.lang = match[1]
                node.meta = match[2]
            }
        })

        file.data.extractedCodeBlocks = codeBlocks
    }
}
