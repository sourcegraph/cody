import { execFile as _execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFile = promisify(_execFile)

export interface GitHelpers {
    getDiffToCommit(options: { cwd: string; stagedOnly: boolean }): Promise<string>
    getOtherCommitMessages(options: { cwd: string }): Promise<string[]>
    gitDir(options: { cwd: string }): Promise<string>
}

export function createGitHelpers(): GitHelpers {
    return {
        async getDiffToCommit({ cwd, stagedOnly }) {
            const { stdout } = await execFile(
                'git',
                [
                    'diff',
                    '--patch',
                    '--unified=1',
                    '--diff-algorithm=minimal',
                    '--no-color',
                    '-M',
                    '-C',
                    stagedOnly ? '--staged' : 'HEAD',
                ],
                { cwd }
            )
            return stdout
        },
        async getOtherCommitMessages({ cwd }) {
            const { stdout: gitAuthorEmail } = await execFile('git', ['config', 'user.email'], {
                cwd,
            })

            const { stdout } = await execFile(
                'git',
                [
                    'log',
                    '-z',
                    '--format=%B',
                    '--max-count=3',
                    '--skip=5', // recent commits might be too similar and too suggestive toward the LLM
                    `--author=${gitAuthorEmail.trim()}`,
                    'refs/remotes/origin/HEAD',
                ],
                {
                    cwd,
                }
            )
            return stdout
                .split('\0')
                .map(message => message.trim())
                .filter(message => message !== '')
        },
        async gitDir({ cwd }) {
            const { stdout } = await execFile('git', ['rev-parse', '--git-dir'])
            return stdout.trim()
        },
    }
}
