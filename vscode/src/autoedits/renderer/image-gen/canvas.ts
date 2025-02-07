import fs from 'node:fs/promises'
import path from 'node:path'
import CanvasKitInit, { type EmulatedCanvas2D } from 'canvaskit-wasm'
import type { ModifiedLineInfoAdded, ModifiedLineInfoRemoved, VisualDiff, VisualDiffLine } from '.'
import type { RemovedLineInfo } from '../decorators/base'
import { DEFAULT_HIGHLIGHT_COLORS, type SYNTAX_HIGHLIGHT_MODE } from './highlight'

type CanvasKitType = Awaited<ReturnType<typeof CanvasKitInit>>
interface RenderContext {
    CanvasKit: CanvasKitType
    font: ArrayBuffer
}

interface DiffColors {
    inserted: {
        line: string
        text: string
    }
    removed: {
        line: string
        text: string
    }
}

interface RenderConfig {
    fontSize: number
    lineHeight: number
    padding: { x: number; y: number }
    maxWidth: number
    pixelRatio: number
    diffColors: DiffColors
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

    await canvasKitInitPromise
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
    line: VisualDiffLine,
    position: { x: number; y: number },
    mode: SYNTAX_HIGHLIGHT_MODE,
    config: RenderConfig
): number {
    if (line.type === 'removed' || line.type === 'modified-removed') {
        // Handle deletions first
        const highlights = line.highlights[mode]
        if (highlights.length === 0) {
            // No syntax highlighting, we probably don't support this language via Shiki
            // Default to white or black depending on the theme
            ctx.fillStyle = DEFAULT_HIGHLIGHT_COLORS[mode]
            ctx.fillText(line.text, position.x, position.y + config.fontSize)
            return ctx.measureText(line.text).width
        }

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

    const lineText = 'newText' in line ? line.newText : line.text
    const highlights = 'newHighlights' in line ? line.newHighlights[mode] : line.highlights[mode]
    if (highlights.length === 0) {
        // No syntax highlighting, we probably don't support this language via Shiki
        // Default to white or black depending on the theme
        ctx.fillStyle = DEFAULT_HIGHLIGHT_COLORS[mode]
        ctx.fillText(lineText, position.x, position.y + config.fontSize)
        return ctx.measureText(lineText).width
    }

    let xPos = position.x
    for (const { range, color } of highlights) {
        const [start, end] = range
        const content = lineText.substring(start, end)
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
    mode: 'additions' | 'unified',
    config: RenderConfig
): void {
    const isRemoval = line.type === 'removed' || line.type === 'modified-removed'

    if (mode === 'unified' && line.type !== 'unchanged') {
        // For unified diffs we ensure we highlight the entire line first
        // This helps the user see exactly which lines are shown as added or deleted.
        // We will apply character level highlighting on top to highlight the changes

        ctx.fillStyle = isRemoval ? config.diffColors.removed.line : config.diffColors.inserted.line
        const endOfLine = ctx.measureText('newText' in line ? line.newText : line.text).width
        ctx.fillRect(position.x, position.y, endOfLine, config.lineHeight)
    }

    if (isRemoval) {
        // Handle deletions first
        ctx.fillStyle = config.diffColors.removed.text
        const removals: [number, number][] = []
        if (line.type === 'removed') {
            removals.push([0, line.text.length])
        }
        if (line.type === 'modified-removed') {
            const modifiedRemovals = line.changes.filter(change => change.type === 'delete')
            removals.push(
                ...modifiedRemovals.map(
                    ({ originalRange }) =>
                        [originalRange.start.character, originalRange.end.character] as [number, number]
                )
            )
        }

        for (const [start, end] of removals) {
            // Calculate width of text before the highlight
            const preHighlightWidth = ctx.measureText(line.text.slice(0, start)).width
            // Calculate width of the highlighted section
            const highlightWidth = ctx.measureText(line.text.slice(start, end)).width

            // Draw highlight at correct position
            ctx.fillRect(position.x + preHighlightWidth, position.y, highlightWidth, config.lineHeight)
        }

        return
    }

    // Now handle any additions
    ctx.fillStyle = config.diffColors.inserted.text
    const lineText = 'newText' in line ? line.newText : line.text
    const additions: [number, number][] = []
    if (line.type === 'added') {
        additions.push([0, lineText.length])
    }
    if (line.type === 'modified' || line.type === 'modified-added') {
        const modifiedAdditions = line.changes.filter(change => change.type === 'insert')
        additions.push(
            ...modifiedAdditions.map(
                change =>
                    [change.modifiedRange.start.character, change.modifiedRange.end.character] as [
                        number,
                        number,
                    ]
            )
        )
    }

    for (const [start, end] of additions) {
        // Calculate width of text before the highlight
        const preHighlightWidth = ctx.measureText(lineText!.slice(0, start)).width
        // Calculate width of the highlighted section
        const highlightWidth = ctx.measureText(lineText!.slice(start, end)).width

        // Draw highlight at correct position
        ctx.fillRect(position.x + preHighlightWidth, position.y, highlightWidth, config.lineHeight)
    }
}

const DIFF_COLORS = {
    inserted: {
        line: 'rgba(155, 185, 85, 0.1)',
        text: 'rgba(155, 185, 85, 0.15)',
    },
    removed: {
        line: 'rgba(255, 0, 0, 0.1)',
        text: 'rgba(255, 0, 0, 0.15)',
    },
}

export function drawDecorationsToCanvas(
    diff: VisualDiff,
    theme: SYNTAX_HIGHLIGHT_MODE,
    mode: 'additions' | 'unified',
    /**
     * Specific configuration to determine how we render the canvas.
     * Consider changing this, or supporting configuration from the user (e.g. font-size)
     */
    renderConfig: RenderConfig = {
        fontSize: 12,
        lineHeight: 14,
        padding: { x: 2, y: 2 },
        maxWidth: 600,
        pixelRatio: 2,
        diffColors: DIFF_COLORS,
    }
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

    const lines =
        mode === 'additions'
            ? diff.lines.filter(
                  (
                      line
                  ): line is Exclude<
                      VisualDiffLine,
                      RemovedLineInfo | ModifiedLineInfoRemoved | ModifiedLineInfoAdded
                  > =>
                      line.type !== 'removed' &&
                      line.type !== 'modified-removed' &&
                      line.type !== 'modified-added'
              )
            : diff.lines

    // In order for us to draw to the canvas, we must first determine the correct
    // dimensions for the canvas. We can do this with a temporary Canvas that uses the same font
    const { ctx: tempCtx } = createCanvas(
        { height: 10, width: 10, fontSize: renderConfig.fontSize },
        context
    )

    // Iterate through each token line, and determine the required width of the canvas (maximum line length)
    // and the required height of the canvas (number of lines determined by their line height)
    let tempYPos = renderConfig.padding.y
    let requiredWidth = 0
    for (const line of lines) {
        const text = 'newText' in line ? line.newText : line.text
        const measure = tempCtx.measureText(text)
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
    for (const line of lines) {
        const position = { x: renderConfig.padding.x, y: yPos }

        // Paint any background diff colors first, we will render the text over the top
        drawDiffColors(ctx, line, position, mode, renderConfig)

        // Draw the text, this may or may not be syntax highlighted depending on language support
        drawText(ctx, line, position, theme, renderConfig)

        yPos += renderConfig.lineHeight
    }

    return canvas
}
