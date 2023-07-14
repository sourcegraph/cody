import { execFile as _execFile } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { promisify } from 'node:util'
import path from 'path'

const execFile = promisify(_execFile)

const commitSignatureEnv: NodeJS.ProcessEnv = {
    GIT_COMMITTER_NAME: 'a',
    GIT_COMMITTER_EMAIL: 'a@a.com',
    GIT_AUTHOR_NAME: 'a',
    GIT_AUTHOR_EMAIL: 'a@a.com',
}

export async function withTemporaryGitRepository<T>({
    committedFiles,
    stagedFiles,
    run,
}: {
    committedFiles?: { [name: string]: string }
    stagedFiles: { [name: string]: string }
    run: (gitDir: string) => T
}): Promise<T> {
    let tmpGitDir: string | undefined
    try {
        tmpGitDir = await mkdtemp(path.join(tmpdir(), 'cody-cli-test-'))

        // Create Git repository.
        await execFile('git', ['init'], { cwd: tmpGitDir })
        if (committedFiles) {
            for (const [name, contents] of Object.entries(committedFiles)) {
                await writeAndGitAddFile(tmpGitDir, name, contents)
            }
        }
        await execFile('git', ['commit', '--message', 'test', '--allow-empty'], {
            cwd: tmpGitDir,
            env: commitSignatureEnv,
        })

        if (stagedFiles) {
            for (const [name, contents] of Object.entries(stagedFiles)) {
                await writeAndGitAddFile(tmpGitDir, name, contents)
            }
        }

        return run(tmpGitDir)
    } finally {
        if (tmpGitDir !== undefined) {
            await rm(tmpGitDir, { recursive: true, force: true })
        }
    }
}

async function writeAndGitAddFile(gitDir: string, name: string, contents: string): Promise<void> {
    await writeFile(path.join(gitDir, name), contents, 'utf8')
    await execFile('git', ['add', '--', name], { cwd: gitDir })
}
