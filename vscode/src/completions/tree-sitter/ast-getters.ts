import Parser, { Point, SyntaxNode } from 'web-tree-sitter'

import { isDefined } from '@sourcegraph/cody-shared'

import { Captures } from './query-tests/annotate-and-match-snapshot'

interface AstGetters {
    getNodeAtCursorAndParents: (
        node: SyntaxNode,
        startPosition: Point,
        endPosition?: Point
    ) => readonly [
        { readonly name: 'at_cursor'; readonly node: Parser.SyntaxNode },
        ...{ name: string; node: Parser.SyntaxNode }[],
    ]
}

export const astGetters: AstGetters = {
    /**
     * Returns a descendant node at the start position and two parent nodes if they exist.
     */
    getNodeAtCursorAndParents: (node, startPosition) => {
        const descendant = node.descendantForPosition(startPosition)
        const parent = descendant.parent

        const parents = [parent, parent?.parent, parent?.parent?.parent].filter(isDefined).map(node => ({
            name: 'parents',
            node,
        }))

        return [
            {
                name: 'at_cursor',
                node: descendant,
            },
            ...parents,
        ] as const
    },
} satisfies Record<string, Captures>
