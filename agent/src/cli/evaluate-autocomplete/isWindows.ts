import os from 'os'

export function isWindows(): boolean {
    return os.platform().startsWith('win')
}
