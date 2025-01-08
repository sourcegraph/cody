import path from 'node:path'
import { Writable } from 'node:stream'
import * as pureimage from 'pureimage'
import { type Highlighter, createHighlighter } from 'shiki'
import type { AddedLinesDecorationInfo } from './renderer/decorators/default-decorator'

let _highlighter: Highlighter | null = null
let _fontLoaded = false

export async function initHighlighter(): Promise<void> {
    if (!_highlighter) {
        _highlighter = await createHighlighter({
            themes: ['vitesse-dark'],
            langs: ['typescript'],
        })
    }

    if (!_fontLoaded) {
        // Point this to an actual .ttf file on disk.
        const font = pureimage.registerFont(
            path.join(__dirname, 'SourceCodePro-Regular.ttf'),
            'Source Code Pro' // the internal font name we’ll reference in ctx.font
        )
        await font.load()
        _fontLoaded = true
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
): Promise<string> {
    const codeBlock = addedLinesInfo.reduce(
        (acc, { lineText }, i) => acc + lineText + (i < addedLinesInfo.length - 1 ? '\n' : ''),
        ''
    )
    const highlighter = ensureHighlighterReady()
    const { tokens } = highlighter.codeToTokens(codeBlock, {
        theme: 'vitesse-dark',
        lang,
    })

    // Default size measurements
    const fontSize = 12
    const lineHeight = 14
    const yPadding = 2
    const xPadding = 6
    const maxWidth = 600
    const pixelRatio = 4

    // Create a temporary bitmap for measurements
    const tempImg = pureimage.make(10, 10)
    const tempCtx = tempImg.getContext('2d')
    tempCtx.font = `${fontSize}px 'Source Code Pro'`

    // Calculate dimensions
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

    const totalWidth = Math.min(requiredWidth + xPadding * 2, maxWidth) // Add extra padding
    const totalHeight = yPos + yPadding * 2 // Add extra padding

    // Create the actual image with 1 extra pixel of space
    const img = pureimage.make(
        Math.ceil(totalWidth * pixelRatio) + 1,
        Math.ceil(totalHeight * pixelRatio) + 1
    )
    const ctx = img.getContext('2d')
    // Scale for high-DPI
    ctx.scale(pixelRatio, pixelRatio)
    ctx.clearRect(0, 0, totalWidth * pixelRatio, totalHeight * pixelRatio)

    // Set text properties
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'left'
    ctx.font = `${fontSize}px "FiraCode"`
    ctx.textBaseline = 'top'

    const highlightColor = 'rgba(35, 134, 54, 0.2)'

    const decorationsByLine = new Map<
        number,
        Array<{
            start: { line: number; character: number }
            end: { line: number; character: number }
        }>
    >()

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
        const actualLineNumber = addedLinesInfo[lineIndex].afterLine
        const lineDecorations = decorationsByLine.get(actualLineNumber) || []
        // Draw highlights
        for (const decoration of lineDecorations) {
            let highlightStartX = xPadding
            let highlightWidth = 0
            let currentX = xPadding
            let currentCharPos = 0

            for (const token of lineTokens) {
                const tokenWidth = ctx.measureText(token.content).width
                const tokenLength = token.content.length
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
        // Draw text
        for (const token of lineTokens) {
            ctx.fillStyle = token.color || '#ffffff'
            ctx.fillText(token.content, xPos, yPos)
            xPos += ctx.measureText(token.content).width
        }

        yPos += lineHeight
    }

    // Convert to PNG data URL
    return new Promise((resolve, reject) => {
        const chunks: Uint8Array[] = []
        const stream = new Writable({
            write(chunk: Uint8Array, encoding: string, callback: () => void) {
                chunks.push(chunk)
                callback()
            },
        })

        stream.on('finish', () => {
            const buffer = Buffer.concat(chunks)
            const base64 = buffer.toString('base64')
            resolve(`data:image/png;base64,${base64}`)
        })
        stream.on('error', reject)

        pureimage.encodePNGToStream(img, stream)
    })
}
