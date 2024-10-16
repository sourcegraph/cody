import { getVSCodeAPI } from './VSCodeApi'

// These functions are used to log messages from the webview to the extension host.
// They are proxies to the same named functions in lib/shared/logger.ts.
export function logDebug(filterLabel: string, text: string, ...args: unknown[]): void {
    log('debug', filterLabel, text, ...args)
}

export function logError(filterLabel: string, text: string, ...args: unknown[]): void {
    log('error', filterLabel, text, ...args)
}

function log(level: 'debug' | 'error', filterLabel: string, text: string, ...args: unknown[]): void {
    getVSCodeAPI().postMessage({
        command: 'log',
        level,
        filterLabel,
        message: `${text} ${args.map(arg => JSON.stringify(arg)).join(' ')}`,
    })
}
