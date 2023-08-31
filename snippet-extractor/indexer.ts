import { Point, SyntaxNode } from "tree-sitter"

const Parser = require('tree-sitter');
const Typescript = require('tree-sitter-typescript').typescript;

var fs = require('fs');

export function indexString(sourceCode: string, filePath: string): CompleteRequest[] {

    const parser = new Parser();
    parser.setLanguage(Typescript);

    const tree = parser.parse(sourceCode);

    const lines = sourceCode.split("\n")

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

export function indexFile(filePath: string): CompleteRequest[] {
    const sourceCode: string = fs.readFileSync(filePath, { encoding: 'utf-8' })
    return indexString(sourceCode, filePath)

}

export interface CompleteResponse {
    items: {
        text: string
        fileContent: string
        range: { start: { line: number; character: number }; end: { line: number; character: number } }
    }[]
}



export interface CompleteRequest {
    uri: string
    content: string
    position: { line: number; character: number },
    identifier: string
}

function extract(lines: string[], start: Point, end: Point): string {
    let line = lines[start.row]
    let name = line.slice(start.column, end.column)
    return name
}

interface ReturnedIdentNode {
    node: SyntaxNode
    identifier: string
}

function find(lines: string[], node: SyntaxNode): ReturnedIdentNode[] {
    let returnNodes: ReturnedIdentNode[] = []

    for (let idx in node.children) {
        let child = node.children[idx]
        if (child.type == 'return_statement' && child.childCount == 2) {
            let returnNode = child.children[0]
            let identifierMaybe = child.children[1]
            if (returnNode.type == 'return' && identifierMaybe.type == 'identifier') {
                let name = extract(lines, identifierMaybe.startPosition, identifierMaybe.endPosition)
                returnNodes.push({ node: identifierMaybe, identifier: name })
            } else {
                console.error(`-> Skipping ${returnNode} because it doesn't match what we want`)
            }
        }

        let recurse = find(lines, child)

        returnNodes = returnNodes.concat(recurse)
    }

    return returnNodes
}


export function findFilesByExtension(path: String, extension: string): string[] {

    var files: string[] = []

    for (let f of fs.readdirSync(path)) {
        let filePath = path + "/" + f
        let st = fs.statSync(filePath)
        let isDir = st.isDirectory()
        if (f != "node_modules") {
            if (isDir) {
                files = files.concat(findFilesByExtension(filePath, extension))
            } else if (f.endsWith("." + extension)) {
                files.push(filePath)
            }
        }

    }

    return files
}

export function indexFolder(path: string, extension: string): CompleteRequest[] {
    let files = findFilesByExtension(path, extension)

    let requests = files.flatMap(filePath => {
        return indexFile(filePath)
    })

    return requests
}


