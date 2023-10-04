import { exec as _exec } from 'child_process'
import { promisify } from 'util'

import { assertEnv } from './utils'

const exec = promisify(_exec)

export enum CaseStatus {
    'PASS',
    'FAIL',
    'NO_CHANGE',
}

export const testCompletionResult = async (
    testFile: string,
    testCommand: string,
    cwd: string
): Promise<CaseStatus.PASS | CaseStatus.FAIL> => {
    const benchmarkDockerImage = assertEnv('BENCHMARK_DOCKER_IMAGE')
    const dockerCommand = `docker run --mount src="${cwd}",target=/app,type=bind ${benchmarkDockerImage}`
    let status: CaseStatus
    try {
        await exec(`${dockerCommand} ${testCommand} ${testFile}`, { cwd })
        status = CaseStatus.PASS
    } catch {
        status = CaseStatus.FAIL
    }
    return status
}
