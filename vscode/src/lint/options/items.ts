import { pluralize } from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'
import type { URI } from 'vscode-uri'
import type { GetItemsResult } from '../../edit/input/quick-pick'
import { getItemLabel } from '../../edit/input/utils'
import { getTextEditorTabs } from '../../editor/utils/open-text-files'

export const MODEL_ITEM = {
    label: 'Model',
    alwaysShow: true,
} satisfies vscode.QuickPickItem

export const FILES_ITEM = {
    label: 'Files',
    alwaysShow: true,
} satisfies vscode.QuickPickItem

export const RULES_ITEM = {
    label: 'Rules',
    alwaysShow: true,
} satisfies vscode.QuickPickItem

export const ONBOARDING_RULES_ITEM = {
    label: 'Create your first Cody lint file...',
    alwaysShow: true,
    description: 'There are no cody lint files in the workspace yet.',
} satisfies vscode.QuickPickItem

const POST_SUBMIT_SEPARATOR: vscode.QuickPickItem = {
    label: 'change',
    kind: vscode.QuickPickItemKind.Separator,
}
const SUBMIT_ITEM: vscode.QuickPickItem = {
    label: 'Submit',
    detail: 'Run Lint',
    alwaysShow: true,
}

export function getLintInputItems(
    activeFiles: number,
    activeRules: number,
    activeModelItem: vscode.QuickPickItem | undefined,
    showModelSelector: boolean
): GetItemsResult {
    const submitItems = activeFiles && activeRules ? [SUBMIT_ITEM, POST_SUBMIT_SEPARATOR] : []

    const lintItems = [
        {
            ...RULES_ITEM,
            detail: activeRules
                ? `${activeRules} ${pluralize('file', activeRules, 'files')}`
                : 'No rules selected',
        },
        {
            ...FILES_ITEM,
            detail: activeFiles
                ? `${activeFiles} ${pluralize('file', activeFiles, 'files')}`
                : 'No files selected',
        },
        {
            label: 'options',
            kind: vscode.QuickPickItemKind.Separator,
        },
        showModelSelector
            ? { ...MODEL_ITEM, detail: activeModelItem ? getItemLabel(activeModelItem) : undefined }
            : null,
    ]

    const items = [...submitItems, ...lintItems].filter(Boolean) as vscode.QuickPickItem[]

    return { items }
}

export interface QuickPickFileItem extends vscode.QuickPickItem {
    file: URI
}

export function getFileInputItems(activeTargetFiles: URI[]) {
    const activeTargetPaths = new Set(activeTargetFiles.map(f => f.path))
    const openFileItems: QuickPickFileItem[] = getTextEditorTabs().map(tab => ({
        file: tab.input.uri,
        label: tab.label ?? tab.input.uri.path.split('/').pop(),
        detail: vscode.workspace.asRelativePath(tab.input.uri, true),
    }))

    const seenPaths = new Set<string>()
    const items: QuickPickFileItem[] = []
    for (const item of openFileItems) {
        if (seenPaths.has(item.file.path)) {
            continue
        }
        seenPaths.add(item.file.path)
        items.push(item)
    }

    const activeItem = items.filter(item => activeTargetPaths.has(item.file.path))
    return { items, activeItem }
}

export async function getRuleInputItems(
    activeLintFiles: URI[],
    lintFilesPromise: Promise<URI[]>
): Promise<[GetItemsResult<QuickPickFileItem | typeof ONBOARDING_RULES_ITEM>, boolean]> {
    const items = (await lintFilesPromise).map(file => ({
        file: file,
        label: file.path.split('/').pop() || file.path,
        detail: vscode.workspace.asRelativePath(file.path, true),
    }))
    const activeLintPaths = new Set(activeLintFiles.map(f => f.path))
    const activeItem = items.filter(item => activeLintPaths.has(item.file.path))

    if (!items.length) {
        return [{ items: [ONBOARDING_RULES_ITEM], activeItem: [ONBOARDING_RULES_ITEM] }, false]
    }
    return [{ items, activeItem }, true]
}
