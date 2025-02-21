import type { EmulatedCanvas2D } from 'canvaskit-wasm'
import { canvasKit, fontCache } from '.'
import type { DiffMode } from '../../visual-diff/types'
import type { VisualDiff, VisualDiffLine } from '../decorated-diff/types'
import { DEFAULT_HIGHLIGHT_COLORS } from '../highlight/constants'
import type { SYNTAX_HIGHLIGHT_THEME } from '../highlight/types'
import { type RenderConfig, type UserProvidedRenderConfig, getRenderConfig } from './render-config'
import type { RenderContext } from './types'
import { getRangesToHighlight } from './utils'

function createCanvas(
    options: {
        width: number
        height: number
        fontSize: number
        scale?: number
        backgroundColor?: string
    },
    context: RenderContext
): {
    canvas: EmulatedCanvas2D
    ctx: CanvasRenderingContext2D
} {
    const { width, height, fontSize, scale, backgroundColor } = options
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
    if (backgroundColor) {
        ctx.fillStyle = backgroundColor
        ctx.fillRect(0, 0, width, height)
    }
    return { canvas, ctx }
}

function drawText(
    ctx: CanvasRenderingContext2D,
    line: VisualDiffLine,
    position: { x: number; y: number },
    mode: SYNTAX_HIGHLIGHT_THEME,
    config: RenderConfig
): number {
    const highlights = line.syntaxHighlights[mode]

    // Handle case with no syntax highlighting
    if (highlights.length === 0) {
        // No syntax highlighting, we probably don't support this language via Shiki
        // Default to white or black depending on the theme
        ctx.fillStyle = DEFAULT_HIGHLIGHT_COLORS[mode]
        ctx.fillText(line.text, position.x, position.y + config.fontSize)
        return ctx.measureText(line.text).width
    }

    // Draw highlighted text segments
    let xPos = position.x
    for (const { range, color } of highlights) {
        const [start, end] = range
        const content = line.text.substring(start, end)
        ctx.fillStyle = color
        ctx.fillText(content, xPos, position.y + config.fontSize)
        xPos += ctx.measureText(content).width
    }

    return xPos
}

function drawDiffColors(
    ctx: CanvasRenderingContext2D,
    line: VisualDiffLine,
    position: { x: number; y: number },
    mode: DiffMode,
    config: RenderConfig
): void {
    const isRemoval = line.type === 'removed' || line.type === 'modified-removed'
    const diffColors = isRemoval ? config.diffColors.removed : config.diffColors.inserted

    // For unified diffs, we want to ensure that changed lines also have a background color
    if (mode === 'unified' && line.type !== 'unchanged') {
        const endOfLine = ctx.measureText(line.text).width
        ctx.fillStyle = diffColors.line
        ctx.fillRect(position.x, position.y, endOfLine, config.lineHeight)
    }

    // Get ranges to highlight based on line type
    const ranges = getRangesToHighlight(line)
    if (ranges.length === 0) {
        return
    }

    // Draw highlights for each range
    ctx.fillStyle = diffColors.text
    for (const [start, end] of ranges) {
        const preHighlightWidth = ctx.measureText(line.text.slice(0, start)).width
        const highlightWidth = ctx.measureText(line.text.slice(start, end)).width
        ctx.fillRect(position.x + preHighlightWidth, position.y, highlightWidth, config.lineHeight)
    }
}

export function drawDecorationsToCanvas(
    diff: VisualDiff,
    theme: SYNTAX_HIGHLIGHT_THEME,
    mode: DiffMode,
    userConfig: UserProvidedRenderConfig
): EmulatedCanvas2D {
    if (!canvasKit || !fontCache) {
        // TODO: Log these errors, useful to see if we run into issues where we're not correctly
        // initializing the canvas
        throw new Error('Canvas not initialized')
    }

    const context: RenderContext = {
        CanvasKit: canvasKit,
        font: fontCache,
    }
    const config = getRenderConfig(userConfig)

    // In order for us to draw to the canvas, we must first determine the correct
    // dimensions for the canvas. We can do this with a temporary Canvas that uses the same font
    const { ctx: tempCtx } = createCanvas({ height: 10, width: 10, fontSize: config.fontSize }, context)

    // Iterate through each token line, and determine the required width of the canvas (maximum line length)
    // and the required height of the canvas (number of lines determined by their line height)
    let tempYPos = config.padding.y
    let requiredWidth = 0
    for (const line of diff.lines) {
        const measure = tempCtx.measureText(line.text)
        requiredWidth = Math.max(requiredWidth, config.padding.x + measure.width)
        tempYPos += config.lineHeight
    }

    // Note: We limit the canvas width to avoid the image getting excessively large.
    // We should consider possible strategies here, such as tweaking this value or refusing
    // to show image decorations for such large images. This could possibly be an area where we would
    // prefer an inline decorator.
    const canvasWidth = Math.min(requiredWidth + config.padding.x, config.maxWidth)
    const canvasHeight = tempYPos + config.padding.y

    // Round to the nearest pixel, using sub-pixels will cause CanvasKit to crash
    const height = Math.round(canvasHeight * config.pixelRatio)
    const width = Math.round(canvasWidth * config.pixelRatio)

    // Now we create the actual canvas, ensuring we scale it accordingly to improve the output resolution.
    const { canvas, ctx } = createCanvas(
        {
            height,
            width,
            fontSize: config.fontSize,
            // We upscale the canvas to improve resolution, this will be brought back to the intended size
            // using the `scale` CSS property when the decoration is rendered.
            scale: config.pixelRatio,
            backgroundColor: config.backgroundColor?.[theme],
        },
        context
    )

    // Paint text and colors onto the canvas
    let yPos = config.padding.y
    for (const line of diff.lines) {
        const position = { x: config.padding.x, y: yPos }

        // Paint any background diff colors first, we will render the text over the top
        drawDiffColors(ctx, line, position, mode, config)

        // Draw the text, this may or may not be syntax highlighted depending on language support
        drawText(ctx, line, position, theme, config)

        yPos += config.lineHeight
    }

    return canvas
}
