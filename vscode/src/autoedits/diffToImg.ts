import { createCanvas } from 'canvas'
import type { DecorationLineInfo } from './renderer/decorators/base'

interface DiffToImageOptions {
    width?: number
    height?: number
    fontSize?: number
    padding?: number
    lineHeight?: number
    colors?: {
        added: string
        removed: string
        modified: string
        unchanged: string
    }
}

export function diffToImg(diffLines: DecorationLineInfo[], options: DiffToImageOptions = {}) {
    // First, trim unnecessary unchanged lines
    const trimmedDiffLines = trimUnchangedLines(diffLines)

    const {
        fontSize = 14,
        padding = 10,
        lineHeight = 1.2,
        colors = {
            added: '#28a745',
            removed: '#dc3545',
            modified: '#0366d6',
            unchanged: '#24292e',
        },
    } = options

    // Calculate dimensions
    const longestLine = Math.max(
        ...trimmedDiffLines.map(line => {
            switch (line.type) {
                case 'modified':
                    return Math.max(line.oldText.length, line.newText.length)
                default:
                    return line.text.length
            }
        })
    )

    // Calculate total lines needed (accounting for modified lines taking 2 spaces)
    const totalLines = trimmedDiffLines.reduce((count, line) => {
        return count + (line.type === 'modified' ? 2 : 1)
    }, 0)

    const width = longestLine * (fontSize * 0.6) + padding * 2
    const height = totalLines * (fontSize * lineHeight) + padding * 2

    // Create canvas
    const canvas = createCanvas(width, height)
    const ctx = canvas.getContext('2d')

    // Configure base text settings
    ctx.font = `${fontSize}px monospace`

    // Draw diff lines
    let currentY = padding + fontSize

    // biome-ignore lint/complexity/noForEach: <explanation>
    trimmedDiffLines.forEach(line => {
        switch (line.type) {
            case 'added':
                ctx.fillStyle = colors.added
                ctx.fillText(`+ ${line.text}`, padding, currentY)
                currentY += fontSize * lineHeight
                break

            case 'removed':
                ctx.fillStyle = colors.removed
                ctx.fillText(`- ${line.text}`, padding, currentY)
                currentY += fontSize * lineHeight
                break

            case 'modified':
                ctx.fillStyle = colors.removed
                ctx.fillText(`- ${line.oldText}`, padding, currentY)
                currentY += fontSize * lineHeight

                ctx.fillStyle = colors.added
                ctx.fillText(`+ ${line.newText}`, padding, currentY)
                currentY += fontSize * lineHeight

                // if (line.changes) {
                //     // biome-ignore lint/complexity/noForEach: <explanation>
                //     line.changes.forEach(change => {
                //         if (change.type === 'insert') {
                //             // const textWidth = ctx.measureText(change.text).width
                //             // const textX = padding + fontSize * 0.6 * change.modifiedRange.start.character
                //             // // ctx.fillStyle = 'rgba(40, 167, 69, 0.2)'
                //             // ctx.fillRect(textX, currentY - fontSize, textWidth, fontSize)
                //         }
                //     })
                // }
                break

            case 'unchanged':
                ctx.fillStyle = colors.unchanged
                ctx.fillText(`  ${line.text}`, padding, currentY)
                currentY += fontSize * lineHeight
                break
        }
    })

    return canvas.toDataURL('image/png')
}

function trimUnchangedLines(lines: DecorationLineInfo[]): DecorationLineInfo[] {
    const firstChangedIndex = lines.findIndex(line => line.type !== 'unchanged')
    if (firstChangedIndex === -1) return []

    const reversedLastChangedIndex = [...lines].reverse().findIndex(line => line.type !== 'unchanged')
    const lastChangedIndex = lines.length - reversedLastChangedIndex - 1

    return lines.slice(firstChangedIndex, lastChangedIndex + 1)
}
