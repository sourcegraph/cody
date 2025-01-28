import fs from 'node:fs/promises'
import path from 'node:path'
import CanvasKitInit, { type EmulatedCanvas2D } from 'canvaskit-wasm'
import type {
    AddedLinesDecorationInfo,
    DiffedTextDecorationRange,
    SyntaxHighlightedTextDecorationRange,
} from '../decorators/default-decorator'
import type { SYNTAX_HIGHLIGHT_MODE } from './highlight'

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
    diffHighlightColor: string
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

/**
 * Load the DejaVuSansMono font, suitable for rendering text onto the canvas.
 * Note: This font was selected as it is available in the public domains and renders code clearly.
 * It is also what the default system font for MacOS (Menlo) is based on, meaning should be familiar for many users.
 *
 * We can consider changing this, or allowing the user to provide their own font in the future.
 */
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
    line: AddedLinesDecorationInfo,
    position: { x: number; y: number },
    mode: SYNTAX_HIGHLIGHT_MODE,
    config: RenderConfig
): number {
    const syntaxRanges = line.highlightedRanges.filter(
        (range): range is SyntaxHighlightedTextDecorationRange => range.type === 'syntax-highlighted'
    )

    if (syntaxRanges.length === 0) {
        // No syntax highlighting, we probably don't support this language via Shiki
        // Default to white or black depending on the theme
        ctx.fillStyle = mode === 'dark' ? '#ffffff' : '#000000'
        ctx.fillText(line.lineText, position.x, position.y + config.fontSize)
        return ctx.measureText(line.lineText).width
    }

    let xPos = position.x
    for (const token of syntaxRanges) {
        const content = line.lineText.substring(token.range[0], token.range[1])
        ctx.fillStyle = token.color
        ctx.fillText(content, xPos, position.y + config.fontSize)
        xPos += ctx.measureText(content).width
    }

    return xPos
}

function drawDiffColors(
    ctx: CanvasRenderingContext2D,
    line: AddedLinesDecorationInfo,
    position: { x: number; y: number },
    config: RenderConfig
): void {
    const addedRanges = line.highlightedRanges.filter(
        (range): range is DiffedTextDecorationRange => range.type === 'diff-added'
    )

    if (addedRanges.length === 0) {
        return
    }

    ctx.fillStyle = config.diffHighlightColor

    for (const range of addedRanges) {
        // Calculate width of text before the highlight
        const preHighlightWidth = ctx.measureText(line.lineText.slice(0, range.range[0])).width
        // Calculate width of the highlighted section
        const highlightWidth = ctx.measureText(line.lineText.slice(range.range[0], range.range[1])).width

        // Draw highlight at correct position
        ctx.fillRect(position.x + preHighlightWidth, position.y, highlightWidth, config.lineHeight)
    }
}

export function drawDecorationsToCanvas(
    decorations: AddedLinesDecorationInfo[],
    mode: SYNTAX_HIGHLIGHT_MODE,
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
        diffHighlightColor: 'rgba(35, 134, 54, 0.2)',
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
    for (const { lineText } of decorations) {
        const measure = tempCtx.measureText(lineText)
        requiredWidth = Math.max(requiredWidth, renderConfig.padding.x + measure.width)
        tempYPos += renderConfig.lineHeight
    }

    // Note: We limit the canvas width to avoid the image getting excessively large.
    // We should consider possible strategies here, such as tweaking this value or refusing
    // to show image decorations for such large images. This could possibly be an area where we would
    // prefer an inline decorator.
    const canvasWidth = Math.min(requiredWidth + renderConfig.padding.x, renderConfig.maxWidth)
    const canvasHeight = tempYPos + renderConfig.padding.y

    // Now we create the actual canvas, ensuring we scale it accordingly to improve the output resolution.
    const { canvas, ctx } = createCanvas(
        {
            height: canvasHeight * renderConfig.pixelRatio,
            width: canvasWidth * renderConfig.pixelRatio,
            fontSize: renderConfig.fontSize,
            // We upscale the canvas to improve resolution, this will be brought back to the intended size
            // using the `scale` CSS property when the decoration is rendered.
            scale: renderConfig.pixelRatio,
        },
        context
    )

    // Paint text and colors onto the canvas
    let yPos = renderConfig.padding.y
    for (const line of decorations) {
        const position = { x: renderConfig.padding.x, y: yPos }

        // Paint any background diff colors first, we will render the text over the top
        drawDiffColors(ctx, line, position, renderConfig)

        // Draw the text, this may or may not be syntax highlighted depending on language support
        drawText(ctx, line, position, mode, renderConfig)

        yPos += renderConfig.lineHeight
    }

    return canvas
}
