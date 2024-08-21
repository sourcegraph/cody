import fs from 'node:fs/promises'
import path from 'node:path'
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
