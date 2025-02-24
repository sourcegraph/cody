import fs from 'node:fs/promises'
import path from 'node:path'
import CanvasKitInit from 'canvaskit-wasm'
import type { CanvasKitType } from './types'

let canvasKitInitPromise: Promise<void> | null = null
export let canvasKit: CanvasKitType | null = null
export let fontCache: ArrayBuffer | null = null

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
            ? path.join(__dirname, '../../../../../resources/DejaVuSansMono.ttf')
            : path.join(__dirname, 'DejaVuSansMono.ttf')

    const buffer = await fs.readFile(fontPath)
    return new Uint8Array(buffer).buffer
}

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
