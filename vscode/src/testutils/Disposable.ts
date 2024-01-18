import type { Disposable as VSCodeDisposable } from 'vscode'

export class Disposable implements VSCodeDisposable {
    public static from(...disposableLikes: { dispose: () => any }[]): Disposable {
        return new Disposable(() => {
            for (const disposable of disposableLikes) {
                disposable.dispose()
            }
        })
    }
    constructor(private readonly callOnDispose: () => any) {}
    public dispose(): void {
        this.callOnDispose()
    }
}
