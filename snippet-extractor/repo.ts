import { indexFolder } from "./indexer"

for (let idx of indexFolder(process.argv[2], "ts")) {
    console.log(JSON.stringify(idx))
}

