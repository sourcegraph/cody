import fs from 'fs'
import path from 'path'

// Read completions from the 'data' directory
const dataDir = path.join(__dirname, '../', 'data')
const jsonFiles = fs.readdirSync(dataDir).filter(file => file.endsWith('.json'))

type CompletionData = {
    snapshotFileName: string
    sample: {
        content: string
    }
    completions: string[]
    timestamp: string
}

const data: CompletionData[] = []

jsonFiles.forEach(file => {
    const filePath = path.join(dataDir, file)
    const fileContent = fs.readFileSync(filePath, 'utf-8')
    const jsonData = JSON.parse(fileContent) as any[]
    for (const sample of jsonData) {
        data.push({
            ...sample,
            snapshotFileName: path.basename(filePath).replace('.json', ''),
        })
    }
})

type CodeToCompletions = Record<string, Omit<CompletionData, 'code'>[]>

const codeToCompletions: CodeToCompletions = {}

// Group data by `code`.
data.forEach(({ completions, timestamp, sample, ...rest }) => {
    if (!codeToCompletions[sample.content]) {
        codeToCompletions[sample.content] = []
    }

    codeToCompletions[sample.content].push({ ...rest, sample, completions, timestamp })
})

export function getCompletions(): Promise<CodeToCompletions> {
    return Promise.resolve(codeToCompletions)
}
