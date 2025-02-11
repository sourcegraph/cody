import type CanvasKitInit from 'canvaskit-wasm'

export type CanvasKitType = Awaited<ReturnType<typeof CanvasKitInit>>

export interface RenderContext {
    CanvasKit: CanvasKitType
    font: ArrayBuffer
}

export interface DiffColors {
    inserted: {
        line: string
        text: string
    }
    removed: {
        line: string
        text: string
    }
}

export interface RenderConfig {
    fontSize: number
    lineHeight: number
    padding: { x: number; y: number }
    maxWidth: number
    pixelRatio: number
    diffColors: DiffColors
}
