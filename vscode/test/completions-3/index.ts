import { execFileSync } from 'child_process'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'
import util from 'util'

import _glob from 'glob'

import { DATASETS, parseDatasetConfig } from './datasets'
import { CaseStatus, evaluateCompletion } from './evaluate-test-case'
import { setup, teardown } from './helpers'

const glob = util.promisify(_glob)

export async function run(): Promise<void> {
    await setup()

    const dataset = DATASETS.HumanEvalInfill

    const tempDir = mkdtempSync(path.join(tmpdir(), 'cody-evaluation-'))
    execFileSync('git', ['clone', dataset.repoUrl, '.'], { cwd: tempDir })
    console.log(tempDir)

    const configFiles = await glob(dataset.caseGlob, { cwd: tempDir })
    for (const configFile of configFiles) {
        const configPath = path.join(tempDir, configFile)
        const files = parseDatasetConfig(configPath)
        const result = await evaluateCompletion(Date.now().toString(), files, path.dirname(configPath))
        console.log(`${result.status === CaseStatus.PASS ? '🟢' : '🔴'} - ${files.generate}`)
    }

    await teardown()
}
