import {CompleteRequest, indexFile} from "./indexer"

const fs = require('fs');

function findFilesByExtension(path: String, extension: string): string[] {

    var files: string[] = []

    for(let f of fs.readdirSync(path)) {
        let filePath = path + "/" + f
        let st = fs.statSync(filePath)
        let isDir = st.isDirectory()
        if(f != "node_modules") {
        if(isDir) {
            files = files.concat(findFilesByExtension(filePath, extension))
        } else if(f.endsWith("." + extension)) {
            files.push(filePath)
        }
        }

    }

    return files
}

function indexFolder(path: string, extension: string): CompleteRequest[]  {
    let files = findFilesByExtension(path, extension)

    let requests = files.flatMap(filePath => {
        return indexFile(filePath)
    })

    return requests
}

for(let idx of indexFolder(process.argv[2],"ts")) {
    console.log(JSON.stringify(idx))
}

