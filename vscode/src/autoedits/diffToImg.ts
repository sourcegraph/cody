import { createCanvas } from 'canvas'
import { createHighlighter } from 'shiki'
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

export async function diffToHighlightedImg(
    code = `console.log("Hello world")`,
    lang = 'typescript' as const
): Promise<{ uri: string; width: number; height: number }> {
    // 1. Initialize the highlighter with a theme
    const highlighter = await createHighlighter({
        themes: ['vitesse-dark'],
        langs: [lang],
    })

    const { tokens } = highlighter.codeToTokens(code, {
        theme: 'vitesse-dark',
        lang,
    })
    highlighter.dispose()

    // Default size measurements. TODO: Revisit these
    const fontSize = 12
    const lineHeight = 14 // a bit bigger than fontSize for spacing
    const padding = 4
    const maxWidth = 600

    const tempCanvas = createCanvas(10, 10)
    const tempCtx = tempCanvas.getContext('2d')
    tempCtx.font = `${fontSize}px monospace`

    /**
     * Determine the correct width and height that the canvas will be
     */
    let yPos = padding
    let requiredWidth = 0
    for (const lineTokens of tokens) {
        let xPos = padding
        for (const token of lineTokens) {
            const measure = tempCtx.measureText(token.content)
            xPos += measure.width
            if (xPos > requiredWidth) {
                requiredWidth = xPos
            }
        }
        yPos += lineHeight
    }
    const totalWidth = Math.min(requiredWidth + padding, maxWidth)
    const totalHeight = yPos + padding

    // Create the canvas, ready to start painting text
    // Pixel ratio for sharper text on high-DPI screens
    const pixelRatio = 2
    const canvas = createCanvas(totalWidth * pixelRatio, totalHeight * pixelRatio)
    const ctx = canvas.getContext('2d')

    // Scale so drawing in logical coords is upsampled
    ctx.scale(pixelRatio, pixelRatio)

    // Start drawing the text into the canvas
    ctx.font = `${fontSize}px monospace`
    ctx.textBaseline = 'top'

    yPos = padding
    for (const lineTokens of tokens) {
        let xPos = padding
        for (const token of lineTokens) {
            // token.color from Shiki is e.g. '#81A1C1'
            ctx.fillStyle = token.color || '#ffffff'
            ctx.fillText(token.content, xPos, yPos)
            xPos += ctx.measureText(token.content).width
        }
        yPos += lineHeight
    }

    return {
        uri: canvas.toDataURL('image/png'),
        width: totalWidth,
        height: totalHeight,
    }
}

function trimUnchangedLines(lines: DecorationLineInfo[]): DecorationLineInfo[] {
    const firstChangedIndex = lines.findIndex(line => line.type !== 'unchanged')
    if (firstChangedIndex === -1) return []

    const reversedLastChangedIndex = [...lines].reverse().findIndex(line => line.type !== 'unchanged')
    const lastChangedIndex = lines.length - reversedLastChangedIndex - 1

    return lines.slice(firstChangedIndex, lastChangedIndex + 1)
}
