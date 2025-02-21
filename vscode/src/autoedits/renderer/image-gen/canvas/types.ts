import type CanvasKitInit from 'canvaskit-wasm'

export type CanvasKitType = Awaited<ReturnType<typeof CanvasKitInit>>

export interface RenderContext {
    CanvasKit: CanvasKitType
    font: ArrayBuffer
}
