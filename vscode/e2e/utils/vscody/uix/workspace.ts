import { exec } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { test as t } from '@playwright/test'
import type { UIXContextFnContext } from '.'

export function modifySettings(
    modifyFn: (settings: Record<string, any> | undefined) => Record<string, any>,
    { workspaceDir }: Pick<UIXContextFnContext, 'workspaceDir'>
) {
    return t.step(
        'Modify Workspace Settings',
        async () => {
            const existingConfig: string | undefined = await fs
                .readFile(path.join(workspaceDir, '.vscode/settings.json'), 'utf-8')
                .catch(err => {
                    if (err.code === 'ENOENT') {
                        return undefined
                    }
                    throw err
                })
            const updatedConfig = modifyFn(existingConfig ? JSON.parse(existingConfig) : undefined)
            await fs.mkdir(path.join(workspaceDir, '.vscode'), { recursive: true })
            fs.writeFile(
                path.join(workspaceDir, '.vscode/settings.json'),
                JSON.stringify(updatedConfig, null, 2)
            )
        },
        { box: true }
    )
}

export async function gitInit(
    args: {
        origin?: string | null
    },
    { workspaceDir }: Pick<UIXContextFnContext, 'workspaceDir'>
): Promise<void> {
    const commands = ['git init', 'git add -A', 'git commit -am "initial commit"']

    // TODO: 🚨 (SECURITY) 🚨 we have to be careful here as we're not cleaning
    // these args and I've not spent time thinking through the implications of
    // that.
    if (args.origin !== null) {
        commands.push(
            `git remote add origin ${args.origin ?? 'https://github.com/sourcegraph/sourcegraph'}`
        )
    }
    const combinedCommands = commands.join(' && ')

    await promisify(exec)(combinedCommands, { cwd: workspaceDir })
}
