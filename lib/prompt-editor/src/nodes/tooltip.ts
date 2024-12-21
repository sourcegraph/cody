import { ContextItemSource, type SerializedContextItem, displayPath } from '@sourcegraph/cody-shared'
import * as v from 'valibot'
import { URI } from 'vscode-uri'

/**
 * The structure of an openctx context item with a tooltip.
 */
const OpenCtxItemWithTooltipSchema = v.object({
    type: v.literal('openctx'),
    mention: v.object({
        data: v.object({
            tooltip: v.string(),
        }),
    }),
})

export function tooltipForContextItem(item: SerializedContextItem): string | undefined {
    if (item.type === 'repository') {
        return `Repository: ${item.repoName ?? item.title ?? 'unknown'}`
    }
    if (item.type === 'tree') {
        return item.title || 'Local workspace'
    }
    if (item.type === 'file') {
        return item.isTooLarge
            ? item.source === ContextItemSource.Initial
                ? 'File is too large. Select a smaller range of lines from the file.'
                : 'File is too large. Try adding the file again with a smaller range of lines.'
            : displayPath(URI.parse(item.uri))
    }
    if (v.is(OpenCtxItemWithTooltipSchema, item)) {
        return item.mention.data.tooltip
    }
    if (item.type === 'openctx') {
        return item.uri
    }
    return undefined
}
