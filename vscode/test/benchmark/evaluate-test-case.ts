import { exec as _exec } from 'child_process'
import { promisify } from 'util'

import { BENCHMARK_DOCKER_IMAGE } from './env'

const exec = promisify(_exec)

export enum CaseStatus {
    'PASS',
    'FAIL',
}

export const testCompletionResult = async (
    testCommand: string,
    cwd: string
): Promise<CaseStatus.PASS | CaseStatus.FAIL> => {
    const dockerCommand = `docker run --mount src="${cwd}",target=/app,type=bind ${BENCHMARK_DOCKER_IMAGE}`
    let status: CaseStatus
    try {
        await exec(`${dockerCommand} ${testCommand}`, { cwd })
        status = CaseStatus.PASS
    } catch (error) {
        console.error(error)
        status = CaseStatus.FAIL
    }
    return status
}
