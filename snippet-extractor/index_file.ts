import { indexFile } from './indexer'

const filePath = process.argv[2]
let nodes = indexFile(filePath)

for (let node of nodes) {
    console.log(JSON.stringify(node))
}
