import type { Action } from '@sourcegraph/cody-shared'

export function commandRowValue(row: Action): string {
    return row.actionType === 'prompt' ? `prompt-${row.id}` : `command-${row.key}`
}
