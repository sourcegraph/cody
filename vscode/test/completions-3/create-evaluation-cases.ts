import { execFileSync } from 'child_process'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'

import { writeAndCommitFile } from './git-helpers'

export const CURSOR = '🔥'

export interface TestCase {
    id: string
    prefix: string
    suffix: string
    solution: string
    test: string
    entrypoint: string
    // Only .py files are supported right now
    extension: 'py'
}

const getEvaluationPrefix = (entrypoint: string): string => `
from generated import ${entrypoint}
import sys
`

const getEvaluationSuffix = (entrypoint: string): string => `
try:
    check(${entrypoint})
except AssertionError:
    sys.exit(1)
sys.exit(0)
`

export interface EvaluationFiles {
    fileDirectory: string
    generationFile: string
    solutionFile: string
    testFile: string
}

export const createEvaluation = ({
    prefix,
    suffix,
    solution,
    test,
    entrypoint,
    extension,
}: TestCase): EvaluationFiles => {
    const directory = mkdtempSync(path.join(tmpdir(), 'cody-evaluation-'))
    execFileSync('git', ['init', '-q'], { cwd: directory })

    return {
        fileDirectory: directory,
        generationFile: writeAndCommitFile(directory, `generated.${extension}`, prefix + CURSOR + suffix),
        solutionFile: writeAndCommitFile(directory, `solution.${extension}`, prefix + solution + suffix),
        testFile: writeAndCommitFile(
            directory,
            `test.${extension}`,
            // TODO: Make this more generic so we can have multiple test harnesses
            // Probably hard coded for different language
            `${getEvaluationPrefix(entrypoint)}${test}${getEvaluationSuffix(entrypoint)}`
        ),
    }
}
