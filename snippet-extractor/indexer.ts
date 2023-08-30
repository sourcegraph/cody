import { Point, SyntaxNode } from 'tree-sitter'

const Parser = require('tree-sitter')
const Typescript = require('tree-sitter-typescript').typescript

var fs = require('fs')

export function indexFile(filePath: string): CompleteRequest[] {
    const sourceCode: string = fs.readFileSync(filePath, { encoding: 'utf-8' })

    const parser = new Parser()
    parser.setLanguage(Typescript)

    const tree = parser.parse(sourceCode)

    const lines = sourceCode.split('\n')

    let returnNodes = find(lines, tree.rootNode)

    let reqs: CompleteRequest[] = []

    for (let r of returnNodes) {
        reqs.push({
            uri: 'file://' + filePath,
            content: sourceCode.replace(`return ${r.identifier}`, 'return '), // TODO(sqs)
            position: {
                line: r.node.startPosition.row,
                character: r.node.startPosition.column,
            },
            identifier: r.identifier,
        })
    }

    return reqs
}

interface CompleteRequest {
    uri: string
    content: string
    position: { line: number; character: number }
    identifier: string
}

function extract(lines: string[], start: Point, end: Point): string {
    let line = lines[start.row]
    let name = line.slice(start.column, end.column)
    return name
}

interface GOTEM {
    node: SyntaxNode
    identifier: string
}

function find(lines: string[], node: SyntaxNode): GOTEM[] {
    let returnNodes: GOTEM[] = []

    for (let idx in node.children) {
        let child = node.children[idx]
        if (child.type == 'return_statement') {
            let returnNode = child.children[0]
            let identifierMaybe = child.children[1]
            if (returnNode.type == 'return' && identifierMaybe.type == 'identifier') {
                let name = extract(lines, identifierMaybe.startPosition, identifierMaybe.endPosition)
                returnNodes.push({ node: identifierMaybe, identifier: name })
            } else {
                console.error(`Skipping ${returnNode} because it doesn't match what we want`)
            }
        }

        let recurse = find(lines, child)

        returnNodes = returnNodes.concat(recurse)
    }

    return returnNodes
}
