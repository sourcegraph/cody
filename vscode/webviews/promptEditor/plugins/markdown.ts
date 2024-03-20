import { $createCodeNode, $isCodeNode, CodeNode } from '@lexical/code'
import type { ElementTransformer, TextFormatTransformer } from '@lexical/markdown'
import type { ElementNode, LexicalNode } from 'lexical'

export const CODE2: ElementTransformer = {
    dependencies: [CodeNode],
    export: (node: LexicalNode) => {
        if (!$isCodeNode(node)) {
            return null
        }
        const textContent = node.getTextContent()
        return (
            '```' + (node.getLanguage() || '') + (textContent ? '\n' + textContent : '') + '\n' + '```'
        )
    },
    regExp: /^```z/,
    replace: createBlockNode(match => {
        return $createCodeNode(match ? match[1] : undefined)
    }),
    type: 'element',
}

export const CODE: TextFormatTransformer = {
    format: ['code'],
    tag: '```',
    type: 'text-format',
}

export const INLINE_CODE: TextFormatTransformer = {
    format: ['code'],
    tag: '`',
    type: 'text-format',
}

function createBlockNode(
    createNode: (match: Array<string>) => ElementNode
): ElementTransformer['replace'] {
    return (parentNode, children, match) => {
        const node = createNode(match)
        node.append(...children)
        parentNode.replace(node)
        node.select(0, 0)
    }
}
