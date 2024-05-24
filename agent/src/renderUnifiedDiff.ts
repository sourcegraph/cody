import { calcSlices } from 'fast-myers-diff'

export function renderUnifiedDiff(
    a: { header: string; text: string },
    b: { header: string; text: string }
): string {
    const lines: string[] = []
    lines.push(`--- ${a.header}`)
    lines.push(`+++ ${b.header}`)
    for (const [kind, parts] of calcSlices(a.text.split('\n'), b.text.split('\n'))) {
        const prefix = kind === -1 ? '- ' : kind === 1 ? '+ ' : '  '
        // TODO: may want to limit the context size. We currently show all lines
        // including the ones that have no diff.
        for (const part of parts) {
            lines.push(prefix + part)
        }
    }
    return lines.join('\n')
}
