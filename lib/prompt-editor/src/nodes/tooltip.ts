import { type SerializedContextItem, displayPath, displayPathWithLines } from '@sourcegraph/cody-shared'
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
        const baseTooltip = item.range
            ? displayPathWithLines(URI.parse(item.uri), item.range)
            : displayPath(URI.parse(item.uri))
        if (item.isTooLarge) {
            return `warning: large file. ${baseTooltip}`
        }
        return baseTooltip
    }
    if (v.is(OpenCtxItemWithTooltipSchema, item)) {
        return item.mention.data.tooltip
    }
    if (item.type === 'openctx') {
        return item.description ?? item.uri
    }
    return undefined
}
