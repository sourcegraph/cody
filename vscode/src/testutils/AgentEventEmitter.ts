import type * as vscode_types from 'vscode'

import { Disposable } from './Disposable'

interface Callback {
    handler: (arg?: any) => any
    thisArg?: any
}

function invokeCallback(callback: Callback, arg?: any): any {
    return callback.thisArg ? callback.handler.bind(callback.thisArg)(arg) : callback.handler(arg)
}

/**
 * Implementation of `vscode.EventEmitter` with a single modification: there's
 * an additional `cody_fireAsync()` method to await on fired events. This functionality
 * is necessary for the agent to be able to reliably know when configuration changes
 * have finished propagating through the extension.
 */
export class AgentEventEmitter<T> implements vscode_types.EventEmitter<T> {
    public on = (): undefined => undefined

    constructor() {
        this.on = () => undefined
    }

    private readonly listeners = new Set<Callback>()
    public event: vscode_types.Event<T> = (listener, thisArgs) => {
        const value: Callback = { handler: listener, thisArg: thisArgs }
        this.listeners.add(value)
        return new Disposable(() => {
            this.listeners.delete(value)
        })
    }

    public fire(data: T): void {
        for (const listener of this.listeners) {
            invokeCallback(listener, data)
        }
    }

    /**
     * Custom extension of the VS Code API to make it possible to `await` on the
     * result of `EventEmitter.fire()`.  Most event listeners return a
     * meaningful `Promise` that is discarded in the signature of the `fire()`
     * function.  Being able to await on returned promise makes it possible to
     * write more robust tests because we don't need to rely on magic timeouts.
     */
    public async cody_fireAsync(data: T): Promise<void> {
        const promises: Promise<void>[] = []
        for (const listener of this.listeners) {
            const value = invokeCallback(listener, data)
            promises.push(Promise.resolve(value))
        }
        await Promise.all(promises)
    }

    public dispose(): void {
        this.listeners.clear()
    }
}
