// IMPORTANT: This file MUST have minimal imports because we need to be able to
// use these loggers everywhere, including during early initialization of the
// process. Be very conservative about adding imports to modules that perform
// any kind of side effect.

/**
 * Interface that mirrors the `logDebug` and `logError` functions in
 * vscode/src/log.ts but is available inside @sourcegraph/cody-shared.
 *
 * We should replace all usages of `console.{log,error,warn}` with calls to
 * these loggers instead. One motivation to do this is to expose more control to
 * all Cody clients over how messages get logged. For example, the JetBrains
 * plugin may want to display warnings/errors in a custom way.
 */
interface CodyLogger {
    logDebug(filterLabel: string, text: string, ...args: unknown[]): void
    logError(filterLabel: string, text: string, ...args: unknown[]): void
}

const consoleLogger: CodyLogger = {
    logDebug(filterLabel, text, ...args) {
        console.log(`${filterLabel}:${text}`, ...args)
    },
    logError(filterLabel, text, ...args) {
        console.log(`${filterLabel}:${text}`, ...args)
    },
}

let _logger = consoleLogger
export function setLogger(newLogger: CodyLogger): void {
    _logger = newLogger
}

export function logDebug(filterLabel: string, text: string, ...args: unknown[]): void {
    _logger.logDebug(filterLabel, text, ...args)
}

export function logError(filterLabel: string, text: string, ...args: unknown[]): void {
    _logger.logError(filterLabel, text, ...args)
}
