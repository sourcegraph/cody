import { exec as _exec } from 'child_process'
import { promisify } from 'util'

import { BENCHMARK_DOCKER_IMAGE } from './env'

const exec = promisify(_exec)

export const testCompletionResult = async (testCommand: string, cwd: string): Promise<boolean> => {
    const dockerCommand = `docker run --mount src="${cwd}",target=/app,type=bind ${BENCHMARK_DOCKER_IMAGE}`
    try {
        await exec(`${dockerCommand} ${testCommand}`, { cwd })
        return true
    } catch (error) {
        console.error(error)
        return false
    }
}
