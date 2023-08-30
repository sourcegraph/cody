import { spawn } from "child_process"
import { CompleteRequest, CompleteResponse, indexFile, indexString } from "./indexer"
import { findFilesByExtension } from "./repo"
import { statSync } from "fs"

async function evaluateFolder(dir: string, complete: (cr: CompleteRequest) => Promise<CompleteResponse>): Promise<Stats> {
    let files = findFilesByExtension(dir, "ts")
    let stats: Stats = {
        total: [],
        missing: [],
        correct: [],
        incorrect: []
    }

    let progress = 0
    let total = files.length

    for (const f of files) {
        console.error(`-> Processing ${f} (${progress}/${total})`)
        let fileResult = await evaluateFile(f, complete)

        stats.total = stats.total.concat(fileResult.total)
        stats.missing = stats.missing.concat(fileResult.missing)
        stats.correct = stats.correct.concat(fileResult.correct)
        stats.incorrect = stats.incorrect.concat(fileResult.incorrect)
        progress += 1
    }

    return stats
}

async function evaluatePath(path: string, complete: (cr: CompleteRequest) => Promise<CompleteResponse>): Promise<Stats> {
    const stat = statSync(path)

    if (stat.isDirectory()) return evaluateFolder(path, complete)
    else return evaluateFile(path, complete)


}


async function evaluateFile(filePath: string, complete: (cr: CompleteRequest) => Promise<CompleteResponse>): Promise<Stats> {
    let requests = indexFile(filePath)

    let stats: Stats = {
        total: requests,
        missing: [],
        correct: [],
        incorrect: []
    }

    function groupBy(requests: CompleteRequest[]) {
        let byLine = new Map<number, CompleteRequest>()

        for (const req of requests) {
            byLine.set(req.position.line, req)
        }
        return byLine
    }



    for (let req of requests) {
        req.position.character = 8

        let completions = await complete(req)
        // let completions = SHIM


        if (completions.items.length == 0) {
            console.error(`-> No completions for ${req.position}(${req.identifier}) at ${req.uri}`)
        } else {
            let completion = completions.items[0]
            let newRequests = groupBy(indexString(completion.fileContent, filePath))
            let found = newRequests.get(req.position.line)
            if (found) {
                if (found.identifier == req.identifier) stats.correct.push(req)
                else stats.incorrect.push(req)
            } else {
                stats.missing.push(req)
            }

        }
    }

    return stats
}

interface Stats {
    missing: CompleteRequest[]
    correct: CompleteRequest[]
    incorrect: CompleteRequest[]
    total: CompleteRequest[]

}


// let SHIM =
//     JSON.parse(`
// {
//   "items": [
//     {
//       "text": "  return msg",
//       "range": {
//         "start": {
//           "line": 2,
//           "character": 0
//         },
//         "end": {
//           "line": 2,
//           "character": 9
//         }
//       },
//       "fileContent": "function helloworld() {\\n  const msg = 'Hello World!'\\n  return msg\\n}\\n"
//     }
//   ]}

//                `) as CompleteResponse

function cliCompleter(command: string) {
    let spl = command.split(" ")
    let cmd = spl[0]
    let args = spl.slice(1)




    let func = async (cr: CompleteRequest) => {

        let proc = spawn(cmd, args)

        proc.stdin.write(JSON.stringify(cr) + "\n")
        proc.stdin.end()

        let output = '';
        proc.stdout.on('data', (chunk) => {
            output += chunk.toString();
        });

        const exitCode = await new Promise((resolve, reject) => {
            proc.on('close', resolve);
        });

        let error = "";
        proc.stderr.on('data', (chunk) => {
            error += chunk.toString();
        });


        if (exitCode) {
            throw new Error(`subprocess error exit ${exitCode}, ${error}`);
        }
        // console.log(`"${output}`)

        return JSON.parse(output) as CompleteResponse

    }

    return func

}

function summarise(result: Stats) {
    let precision = 100 * (result.correct.length + result.incorrect.length) / result.total.length

    console.error(`Precision: ${precision}%`)

}

async function run() {
    let path = process.argv[2]
    let cmd = process.argv[3]
    let result = await evaluatePath(path, cliCompleter(cmd))
    summarise(result)

}

run()
