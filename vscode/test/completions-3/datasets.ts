import { readFileSync } from 'fs'

interface Dataset {
    repoUrl: string
    caseGlob: string
}

export const DATASETS = {
    HumanEvalInfill: {
        repoUrl: 'https://github.com/sourcegraph/cody-evaluation-datasets',
        caseGlob: 'HumanEval/Infilling/**/case.json',
    },
} satisfies { [key: string]: Dataset }

export interface DatasetConfig {
    generate: string
    solution: string
    test: string
}

export function parseDatasetConfig(path: string): DatasetConfig {
    const file = readFileSync(path, 'utf8')
    return JSON.parse(file) as DatasetConfig
}
