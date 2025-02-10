export interface UI3Service {
    createWindow(): Promise<UI3Window>
}

type UUID = `${string}-${string}-${string}-${string}-${string}`

export type WindowID = `W-${UUID}`

export function newWindowID(): WindowID {
    return `W-${crypto.randomUUID()}`
}

export function isWindowID(id: string): id is WindowID {
    return id.startsWith('W-')
}

export interface UI3Window {
    id: WindowID
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
