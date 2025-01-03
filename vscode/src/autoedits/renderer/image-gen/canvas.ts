import fs from 'node:fs/promises'
import path from 'node:path'
import CanvasKitInit, { type EmulatedCanvas2D } from 'canvaskit-wasm'
import type { HighlightedAddedLinesDecorationInfo } from './highlight'

type CanvasKitType = Awaited<ReturnType<typeof CanvasKitInit>>
type RenderContext = {
    CanvasKit: CanvasKitType
    font: ArrayBuffer
}

type RenderConfig = {
    fontSize: number
    lineHeight: number
    padding: { x: number; y: number }
    maxWidth: number
    pixelRatio: number
    highlightColor: string
}

let canvasKit: CanvasKitType | null = null
let canvasKitInitPromise: Promise<void> | null = null
let fontCache: ArrayBuffer | null = null

export async function initCanvas(): Promise<void> {
    if (!fontCache) {
        fontCache = await initFont()
    }

    if (!canvasKitInitPromise) {
        canvasKitInitPromise = (async () => {
            canvasKit = await CanvasKitInit()
        })()
    }
}

async function initFont(): Promise<ArrayBuffer> {
    // Note: The font path will be slightly different in tests to production.
    // Relative to the test file for our tests, but relative to the dist directory in production
    const fontPath =
        process.env.NODE_ENV === 'test'
            ? path.join(__dirname, '../../../../resources/DejaVuSansMono.ttf')
            : path.join(__dirname, 'DejaVuSansMono.ttf')

    const buffer = await fs.readFile(fontPath)
    return new Uint8Array(buffer).buffer
}

function createCanvas(
    options: {
        width: number
        height: number
        fontSize: number
        scale?: number
    },
    context: RenderContext
): {
    canvas: EmulatedCanvas2D
    ctx: CanvasRenderingContext2D
} {
    const { width, height, fontSize, scale } = options
    const canvas = context.CanvasKit.MakeCanvas(width, height)
    canvas.loadFont(context.font, { family: 'DejaVuSansMono' })
    const ctx = canvas.getContext('2d')
    if (!ctx) {
        throw new Error('Failed to get 2D context')
    }
    ctx.font = `${fontSize}px DejaVuSansMono`
    if (scale) {
        ctx.scale(scale, scale)
    }
    return { canvas, ctx }
}

function drawText(
    ctx: CanvasRenderingContext2D,
    line: HighlightedAddedLinesDecorationInfo,
    position: { x: number; y: number },
    config: RenderConfig
): number {
    let xPos = position.x

    for (const token of line.highlightedTokens) {
        ctx.fillStyle = token.color || '#ffffff'
        ctx.fillText(token.content, xPos, position.y + config.fontSize)
        xPos += ctx.measureText(token.content).width
    }

    return xPos
}

function drawHighlights(
    ctx: CanvasRenderingContext2D,
    line: HighlightedAddedLinesDecorationInfo,
    position: { x: number; y: number },
    config: RenderConfig
): void {
    if (line.ranges.length === 0) {
        // Nothing to highlight
        return
    }

    ctx.fillStyle = config.highlightColor

    let xPos = position.x
    let currentPos = 0

    // Iterate through the tokens and paint any highlighted ranges
    for (const token of line.highlightedTokens) {
        const tokenWidth = ctx.measureText(token.content).width
        const tokenEnd = currentPos + token.content.length

        for (const [start, end] of line.ranges) {
            if (currentPos < end && tokenEnd > start) {
                const highlightStart = Math.max(0, start - currentPos)
                const highlightEnd = Math.min(token.content.length, end - currentPos)

                const preHighlightWidth = ctx.measureText(token.content.slice(0, highlightStart)).width
                const highlightWidth = ctx.measureText(
                    token.content.slice(highlightStart, highlightEnd)
                ).width

                ctx.fillRect(xPos + preHighlightWidth, position.y, highlightWidth, config.lineHeight)
            }
        }

        xPos += tokenWidth
        currentPos += token.content.length
    }
}

export function drawTokensToCanvas(
    highlightedDecorations: HighlightedAddedLinesDecorationInfo[],
    /**
     * Specific configuration to determine how we render the canvas.
     * Consider changing this, or supporting configuration from the user (e.g. font-size)
     */
    renderConfig: RenderConfig = {
        fontSize: 12,
        lineHeight: 14,
        padding: { x: 6, y: 2 },
        maxWidth: 600,
        pixelRatio: 2,
        highlightColor: 'rgba(35, 134, 54, 0.2)',
    }
): EmulatedCanvas2D {
    if (!canvasKit || !fontCache) {
        throw new Error('Canvas not initialized')
    }

    const context: RenderContext = {
        CanvasKit: canvasKit,
        font: fontCache,
    }

    // In order for us to draw to the canvas, we must first determine the correct
    // dimensions for the canvas. We can do this with a temporary Canvas that uses the same font
    const { ctx: tempCtx } = createCanvas({ height: 10, width: 10, fontSize: 12 }, context)

    // Iterate through each token line, and determine the required width of the canvas (maximum line length)
    // and the required height of the canvas (number of lines determined by their line height)
    let tempYPos = renderConfig.padding.y
    let requiredWidth = 0
    for (const { highlightedTokens } of highlightedDecorations) {
        let tempXPos = renderConfig.padding.x
        for (const token of highlightedTokens) {
            const measure = tempCtx.measureText(token.content)
            tempXPos += measure.width
            requiredWidth = Math.max(requiredWidth, tempXPos)
        }
        tempYPos += renderConfig.lineHeight
    }

    // TODO: Determine if we want a maximum width and maximum height here.
    // Can we support some overscroll?
    const canvasWidth = Math.min(requiredWidth + renderConfig.padding.x, renderConfig.maxWidth)
    const canvasHeight = tempYPos + renderConfig.padding.y

    // Now we create the actual canvas, ensuring we scale it accordingly to improve the output resolution.
    const { canvas, ctx } = createCanvas(
        {
            height: canvasHeight * renderConfig.pixelRatio,
            width: canvasWidth * renderConfig.pixelRatio,
            fontSize: renderConfig.fontSize,
            scale: renderConfig.pixelRatio,
        },
        context
    )

    // Draw content line by line
    let yPos = renderConfig.padding.y
    for (const line of highlightedDecorations) {
        const position = { x: renderConfig.padding.x, y: yPos }

        // Draw any highlights first
        drawHighlights(ctx, line, position, renderConfig)

        // Draw text on top
        drawText(ctx, line, position, renderConfig)

        yPos += renderConfig.lineHeight
    }

    return canvas
}
