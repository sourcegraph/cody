import fs from 'node:fs/promises'
import path from 'node:path'
import CanvasKitInit, { type EmulatedCanvas2D } from 'canvaskit-wasm'
import { type Highlighter, type ThemedToken, createHighlighter } from 'shiki'
import type { AddedLinesDecorationInfo } from './decorators/default-decorator'

type CanvasKitType = Awaited<ReturnType<typeof CanvasKitInit>>
type RenderContext = {
    CanvasKit: CanvasKitType
    highlighter: Highlighter
    font: ArrayBuffer
}
const CANVAS_CONFIG = {
    fontSize: 12,
    lineHeight: 14,
    padding: { x: 6, y: 2 },
    maxWidth: 600,
    pixelRatio: 2,
    highlightColor: 'rgba(35, 134, 54, 0.2)',
} as const

interface Decoration {
    start: { line: number; character: number }
    end: { line: number; character: number }
}

// Singleton instances
let canvasKit: CanvasKitType | null = null
let canvasKitInitPromise: Promise<void> | null = null
let highlighter: Highlighter | null = null
let fontCache: ArrayBuffer | null = null

async function loadFont(): Promise<ArrayBuffer> {
    const fontPath = path.join(__dirname, 'DejaVuSansMono.ttf')
    const buffer = await fs.readFile(fontPath)
    return new Uint8Array(buffer).buffer
}

export async function initDiffImageGenerator(): Promise<void> {
    if (!canvasKitInitPromise) {
        canvasKitInitPromise = CanvasKitInit().then(ck => {
            canvasKit = ck
        })
    }
    await canvasKitInitPromise

    if (!highlighter) {
        highlighter = await createHighlighter({
            themes: ['vitesse-dark'],
            langs: ['typescript'],
        })
    }

    if (!fontCache) {
        fontCache = await loadFont()
    }
}

function getContext(): RenderContext {
    if (!canvasKit || !highlighter || !fontCache) {
        throw new Error(
            'Environment not initialized. Call and await initCanvasKitAndHighlighter() first.'
        )
    }
    return { CanvasKit: canvasKit, highlighter, font: fontCache }
}

function createCanvas(
    width: number,
    height: number,
    context: RenderContext
): {
    canvas: EmulatedCanvas2D
    ctx: CanvasRenderingContext2D
} {
    const canvas = context.CanvasKit.MakeCanvas(width, height)
    canvas.loadFont(context.font, { family: 'DejaVuSansMono' })
    const ctx = canvas.getContext('2d')
    if (!ctx) {
        throw new Error('Failed to get 2D context')
    }
    return { canvas, ctx }
}

function calculateDimensions(
    tokens: ThemedToken[][],
    ctx: CanvasRenderingContext2D
): { width: number; height: number } {
    let yPos = CANVAS_CONFIG.padding.y
    let requiredWidth = 0

    for (const lineTokens of tokens) {
        let xPos = CANVAS_CONFIG.padding.x
        for (const token of lineTokens) {
            const measure = ctx.measureText(token.content)
            xPos += measure.width
            requiredWidth = Math.max(requiredWidth, xPos)
        }
        yPos += CANVAS_CONFIG.lineHeight
    }

    const totalWidth = Math.min(requiredWidth + CANVAS_CONFIG.padding.x, CANVAS_CONFIG.maxWidth)
    const totalHeight = yPos + CANVAS_CONFIG.padding.y

    return { width: totalWidth, height: totalHeight }
}

function drawHighlights(
    ctx: CanvasRenderingContext2D,
    lineTokens: ThemedToken[],
    decorations: Decoration[],
    yPos: number
) {
    for (const decoration of decorations) {
        let highlightStartX = CANVAS_CONFIG.padding.x
        let highlightWidth = 0
        let currentX = CANVAS_CONFIG.padding.x
        let currentCharPos = 0

        for (const token of lineTokens) {
            const tokenWidth = ctx.measureText(token.content).width
            const tokenLength = token.content.length

            if (
                currentCharPos <= decoration.start.character &&
                currentCharPos + tokenLength >= decoration.start.character
            ) {
                const charsBeforeStart = decoration.start.character - currentCharPos
                const startOffsetWidth = ctx.measureText(token.content.slice(0, charsBeforeStart)).width
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

        ctx.fillStyle = CANVAS_CONFIG.highlightColor
        ctx.fillRect(highlightStartX, yPos, highlightWidth, CANVAS_CONFIG.lineHeight)
    }
}

function drawText(ctx: CanvasRenderingContext2D, lineTokens: ThemedToken[], yPos: number) {
    let xPos = CANVAS_CONFIG.padding.x
    for (const token of lineTokens) {
        ctx.fillStyle = token.color || '#ffffff'
        ctx.fillText(token.content, xPos, yPos + CANVAS_CONFIG.fontSize)
        xPos += ctx.measureText(token.content).width
    }
}

export function diffToPng(
    addedLinesInfo: AddedLinesDecorationInfo[],
    lang = 'typescript' as const
): string {
    const context = getContext()

    // Prepare code and tokens
    const codeBlock = addedLinesInfo.map(({ lineText }) => lineText).join('\n')

    // We must highlight the code ourselves, use a suitable theme here
    // TODO: Support light mode
    const { tokens } = context.highlighter.codeToTokens(codeBlock, {
        theme: 'vitesse-dark',
        lang,
    })

    // Create temporary canvas to calculate dimensions
    // This tells us how big our canvas needs to be, before we start drawing
    const { ctx: tempCtx } = createCanvas(10, 10, context)
    tempCtx.font = `${CANVAS_CONFIG.fontSize}px DejaVuSansMono`
    const { width, height } = calculateDimensions(tokens, tempCtx)

    // Create the actual canvas, and scale it with a pixelRatio to improve the output resolution
    const { canvas, ctx } = createCanvas(
        width * CANVAS_CONFIG.pixelRatio,
        height * CANVAS_CONFIG.pixelRatio,
        context
    )
    ctx.scale(CANVAS_CONFIG.pixelRatio, CANVAS_CONFIG.pixelRatio)
    ctx.font = `${CANVAS_CONFIG.fontSize}px DejaVuSansMono`

    const decorationsByLine = new Map(
        addedLinesInfo.map(({ afterLine, ranges }) => [
            afterLine,
            ranges.map(([start, end]) => ({
                start: { line: afterLine, character: start },
                end: { line: afterLine, character: end },
            })),
        ])
    )

    // Render each line
    let yPos = CANVAS_CONFIG.padding.y
    for (let lineIndex = 0; lineIndex < tokens.length; lineIndex++) {
        const lineTokens = tokens[lineIndex]
        const actualLineNumber = addedLinesInfo[lineIndex].afterLine
        const lineDecorations = decorationsByLine.get(actualLineNumber) || []

        drawHighlights(ctx, lineTokens, lineDecorations, yPos)
        drawText(ctx, lineTokens, yPos)

        yPos += CANVAS_CONFIG.lineHeight
    }

    return canvas.toDataURL('image/png')
}
