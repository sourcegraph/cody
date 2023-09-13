import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import path from 'path'

const commitSignatureEnv: NodeJS.ProcessEnv = {
    GIT_COMMITTER_NAME: 'a',
    GIT_COMMITTER_EMAIL: 'a@a.com',
    GIT_AUTHOR_NAME: 'a',
    GIT_AUTHOR_EMAIL: 'a@a.com',
}

export function writeAndCommitFile(dirPath: string, fileName: string, fileContents: string): string {
    const filePath = path.join(dirPath, fileName)
    writeFileSync(filePath, fileContents, 'utf8')
    execFileSync('git', ['add', '--', filePath], { cwd: dirPath })
    execFileSync('git', ['commit', '--message', 'add', '--allow-empty'], {
        cwd: dirPath,
        env: commitSignatureEnv,
    })
    return filePath
}
