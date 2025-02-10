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
