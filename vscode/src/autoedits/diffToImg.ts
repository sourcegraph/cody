import { createCanvas } from 'canvas'
import { type Highlighter, createHighlighter } from 'shiki'
import type { AddedLinesDecorationInfo } from './renderer/decorators/default-decorator'

let _highlighter: Highlighter | null = null

export async function initHighlighter(): Promise<void> {
    if (!_highlighter) {
        _highlighter = await createHighlighter({
            themes: ['vitesse-dark'],
            langs: ['typescript'],
        })
    }
}

function ensureHighlighterReady(): Highlighter {
    if (!_highlighter) {
        throw new Error(
            'Shiki highlighter is not initialized. ' +
                'Call initHighlighter() and await it before using highlightSync().'
        )
    }
    return _highlighter
}

export function diffToHighlightedImg(
    addedLinesInfo: AddedLinesDecorationInfo[],
    lang = 'typescript' as const
): string {
    const codeBlock = addedLinesInfo.reduce(
        (acc, { lineText }, i) => acc + lineText + (i < addedLinesInfo.length - 1 ? '\n' : ''),
        ''
    )
    const highlighter = ensureHighlighterReady()
    const { tokens } = highlighter.codeToTokens(codeBlock, {
        theme: 'vitesse-dark',
        lang,
    })

    const decorations = addedLinesInfo.flatMap(({ ranges, afterLine }) =>
        ranges.map(([start, end]) => ({
            start: { line: afterLine, character: start },
            end: { line: afterLine, character: end },
        }))
    )

    // Default size measurements. TODO: Revisit these
    const fontSize = 12
    const lineHeight = 14 // a bit bigger than fontSize for spacing
    const yPadding = 2
    const xPadding = 6
    const maxWidth = 600

    const tempCanvas = createCanvas(10, 10)
    const tempCtx = tempCanvas.getContext('2d')
    tempCtx.font = `${fontSize}px monospace`

    /**
     * Determine the correct width and height that the canvas will be
     */
    let yPos = yPadding
    let requiredWidth = 0
    for (const lineTokens of tokens) {
        let xPos = xPadding
        for (const token of lineTokens) {
            const measure = tempCtx.measureText(token.content)
            xPos += measure.width
            if (xPos > requiredWidth) {
                requiredWidth = xPos
            }
        }
        yPos += lineHeight
    }
    const totalWidth = Math.min(requiredWidth + xPadding, maxWidth)
    const totalHeight = yPos + yPadding

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

    const highlightColor = 'rgba(35, 134, 54, 0.2)'

    const decorationsByLine = new Map<number, typeof decorations>()
    for (const { afterLine, ranges } of addedLinesInfo) {
        const lineDecorations = ranges.map(([start, end]) => ({
            start: { line: afterLine, character: start },
            end: { line: afterLine, character: end },
        }))
        decorationsByLine.set(afterLine, lineDecorations)
    }

    yPos = yPadding
    for (let lineIndex = 0; lineIndex < tokens.length; lineIndex++) {
        const lineTokens = tokens[lineIndex]
        let xPos = xPadding

        // Get the actual line number from addedLinesInfo
        const actualLineNumber = addedLinesInfo[lineIndex].afterLine
        const lineDecorations = decorationsByLine.get(actualLineNumber) || []

        // Draw highlight backgrounds first
        for (const decoration of lineDecorations) {
            let highlightStartX = xPadding
            let highlightWidth = 0
            let currentX = xPadding
            let currentCharPos = 0

            for (const token of lineTokens) {
                const tokenWidth = ctx.measureText(token.content).width
                const tokenLength = token.content.length

                // Check if this token contains the start position
                if (
                    currentCharPos <= decoration.start.character &&
                    currentCharPos + tokenLength >= decoration.start.character
                ) {
                    const charsBeforeStart = decoration.start.character - currentCharPos
                    const startOffsetWidth = ctx.measureText(
                        token.content.slice(0, charsBeforeStart)
                    ).width
                    highlightStartX = currentX + startOffsetWidth
                }

                // Check if this token contains the end position
                if (
                    currentCharPos <= decoration.end.character &&
                    currentCharPos + tokenLength >= decoration.end.character
                ) {
                    const charsBeforeEnd = decoration.end.character - currentCharPos
                    const endOffsetWidth = ctx.measureText(token.content.slice(0, charsBeforeEnd)).width
                    highlightWidth = currentX + endOffsetWidth - highlightStartX
                }

                currentX += tokenWidth
                currentCharPos += tokenLength
            }

            ctx.fillStyle = highlightColor
            ctx.fillRect(highlightStartX, yPos, highlightWidth, lineHeight)
        }
        // Draw the text on top
        for (const token of lineTokens) {
            ctx.fillStyle = token.color || '#ffffff'
            ctx.fillText(token.content, xPos, yPos)
            xPos += ctx.measureText(token.content).width
        }

        yPos += lineHeight
    }
    return canvas.toDataURL('image/png')
}
