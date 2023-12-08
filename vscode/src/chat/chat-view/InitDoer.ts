import { isError } from 'lodash'

/**
 * Accepts actions that should block on initialization. If invoked before initialization, queues
 * the actions to be invoked upon initialization.
 */
export class InitDoer<R> {
    private onInitTodos: Todoable<R>[] = []
    private isInitialized = false

    public signalInitialized(): void {
        if (this.isInitialized) {
            return
        }
        {
            // This block must execute synchronously, because this.isInitialized
            // and this.onInitTodos must be updated atomically.
            this.isInitialized = true
            for (const { todo, onDone, onError } of this.onInitTodos) {
                try {
                    Promise.resolve(todo()).then(onDone, onError)
                } catch (error) {
                    onError(isError(error) ? error : new Error(`${error}`))
                }
            }
            this.onInitTodos = []
        }
    }

    public do(todo: () => Thenable<R> | R): Thenable<R> {
        if (this.isInitialized) {
            return Promise.resolve(todo())
        }

        return new Promise<R>((resolve, reject) => {
            // Check again if we're initialized now
            if (this.isInitialized) {
                Promise.resolve(todo()).then(
                    result => resolve(result),
                    error => reject(error)
                )
                return
            }

            // Not yet initialized, add it to the queue
            this.onInitTodos.push({
                todo,
                onDone: result => resolve(result),
                onError: error => reject(error),
            })
        })
    }
}

interface Todoable<R> {
    todo: () => Thenable<R> | R
    onDone: (result: R) => void
    onError: (error: unknown) => void
}
