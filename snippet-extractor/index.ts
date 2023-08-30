import { Point, SyntaxNode } from "tree-sitter"

const Parser = require('tree-sitter');
const Typescript = require('tree-sitter-typescript').typescript;

var fs = require('fs');

const filePath = process.argv[2]

const sourceCode: string = fs.readFileSync(filePath, { encoding: 'utf-8' })

const parser = new Parser();
parser.setLanguage(Typescript);

const tree = parser.parse(sourceCode);

const lines = sourceCode.split("\n")

interface CompleteRequest {
  uri: string
  content: string
  position: { line: number; character: number },
  identifier: string
}

function extract(start: Point, end: Point): string {
  let line = lines[start.row]
  console.log(`"${line}"`)
  console.error(start)
  console.error(end)
  let name = line.slice(start.column, end.column)
  return name
}

interface GOTEM {
  node: SyntaxNode,
  identifier: string
}

function find(node: SyntaxNode): GOTEM[] {
  let returnNodes: GOTEM[] = []

  for (let idx in node.children) {
    let child = node.children[idx]
    if (child.type == "return_statement") {
      let returnNode = child.children[0]
      let identifierMaybe = child.children[1]
      if (returnNode.type == "return" && identifierMaybe.type == "identifier") {
        let name = extract(identifierMaybe.startPosition, identifierMaybe.endPosition)
        returnNodes.push({ node: child, identifier: name })
      }
      else {
        console.error(`Skipping ${returnNode} because it doesn't match what we want`)
      }
    }

    let recurse = find(child)

    returnNodes = returnNodes.concat(recurse)
  }

  return returnNodes
}

let returnNodes = find(tree.rootNode)

for (let r of returnNodes) {
  const req: CompleteRequest = {
    uri: "file://" + filePath,
    content: sourceCode,
    position: {
      line: r.node.startPosition.row,
      character: r.node.startPosition.column,
    },
    identifier: r.identifier
  }

  console.log(JSON.stringify(req))
}
