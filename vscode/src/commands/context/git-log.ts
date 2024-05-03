import { type SpawnOptionsWithoutStdio, spawn } from 'node:child_process'
import path from 'node:path'
import {
    type ContextItem,
    ContextItemSource,
    type FileURI,
    wrapInActiveSpan,
} from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'

export async function getContextFileFromGitLog(
    file: FileURI,
    options: {
        /**
         * Uses git log's -L:<funcname>:<file> traces the evolution of the
         * function name regex <funcname>, within the <file>. This relies on
         * reasonable heuristics built into git to find function bodies. However,
         * the heuristics often fail so we should switch to computing the line
         * region ourselves.
         * https://git-scm.com/docs/git-log#Documentation/git-log.txt--Lltfuncnamegtltfilegt
         */
        funcname: string
        /**
         * Limit the amount of commits to maxCount.
         */
        maxCount: number
    }
): Promise<ContextItem[]> {
    return wrapInActiveSpan('commands.context.git-log', async span => {
        // Run from the directory file is in and let git discover the correct repo
        // to use.
        const cwd = path.dirname(file.fsPath)
        const args = ['log', `-L:${options.funcname}:${file.fsPath}`, `--max-count=${options.maxCount}`]
        const result = await spawnAsync('git', args, { cwd })

        // TODO unsure of the best way to communicate this. Do we update the
        // return signature? Or do we throw a special error that we catch and
        // handle?
        if (result.code !== 0) {
            // This is an expected condition if git doesn't understand the
            // symbol. We communicate up via finding no context.
            if (result.stderr.includes('no match')) {
                return []
            }
            throw new Error(`git log failed with exit code ${result.code}: ${result.stderr}`)
        }

        return [
            {
                type: 'file',
                content: result.stdout,
                title: 'Terminal Output',
                uri: vscode.Uri.file('terminal-output'),
                source: ContextItemSource.History,
            },
        ]
    })
}

interface SpawnResult {
    stdout: string
    stderr: string
    code: number
}

async function spawnAsync(
    command: string,
    args: readonly string[],
    opts: SpawnOptionsWithoutStdio
): Promise<SpawnResult> {
    const childProcess = spawn(command, args, opts)

    let stdout = ''
    let stderr = ''
    childProcess.stdout.on('data', data => {
        stdout += data.toString()
    })
    childProcess.stderr.on('data', data => {
        stderr += data.toString()
    })

    let code = -1
    await new Promise<void>((resolve, reject) => {
        childProcess.on('close', returnCode => {
            if (returnCode === null) {
                reject(new Error('Process closed with null return code'))
            } else {
                code = returnCode
                resolve()
            }
        })
    })

    return {
        stdout,
        stderr,
        code,
    }
}
