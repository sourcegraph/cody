import { type UI3Window, type WindowID, newWindowID } from '@sourcegraph/cody-shared'

export interface UI3Service {
    createWindow(): Promise<UI3Window>
}

export function createUI3Service(): UI3Service {
    const windows = new Map<WindowID, UI3Window>()
    return {
        async createWindow(): Promise<UI3Window> {
            const id = newWindowID()
            const w: UI3Window = { id }
            windows.set(id, w)
            return w
        },
    }
}

export const ui3Service = createUI3Service()
