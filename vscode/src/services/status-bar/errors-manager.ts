import * as vscode from 'vscode'

export type StatusBarErrorName = 'auth' | 'RateLimitError' | 'AutoCompleteDisabledByAdmin'

export class CodyStatusError {
    private createdAt = Date.now()

    public onDidChangeErrors
    public _onDidChangeErrors

    constructor(
        public title: string,
        public description: string,
        public errorType: StatusBarErrorName,
        public removeAfterSelected: boolean,
        public removeAfterEpoch?: number,
        public onShow?: () => void,
        public onSelect?: () => void
    ) {
        this.onDidChangeErrors = new vscode.EventEmitter()
        this._onDidChangeErrors = this.onDidChangeErrors.event
    }

    // Clean up all errors after a certain time so they don't accumulate forever
    private static clearOutdatedErrors(): void {
        const now = Date.now()
        const errors = CodyStatusError._errors
        for (let i = errors.length - 1; i >= 0; i--) {
            const error = errors[i]
            if (
                now - error.createdAt >= ONE_HOUR ||
                (error.removeAfterEpoch && now - error.removeAfterEpoch >= 0)
            ) {
                errors.splice(i, 1)
            }
        }
        // rerender()
    }

    private static _errors: CodyStatusError[] = []

    static add(error: CodyStatusError) {
        CodyStatusError._errors.push(error)

        if (error.removeAfterEpoch && error.removeAfterEpoch > error.createdAt) {
            setTimeout(
                CodyStatusError.clearOutdatedErrors,
                Math.min(ONE_HOUR, error.removeAfterEpoch - error.createdAt)
            )
        } else {
            setTimeout(CodyStatusError.clearOutdatedErrors, ONE_HOUR)
        }

        // rerender()

        return () => {
            const index = CodyStatusError._errors.indexOf(error)
            if (index !== -1) {
                CodyStatusError._errors.splice(index, 1)
                // rerender()
            }
        }
    }

    static remove(error: CodyStatusError) {
        const index = CodyStatusError._errors.indexOf(error)
        if (index !== -1) {
            CodyStatusError._errors.splice(index, 1)
        }
    }

    static get errors(): CodyStatusError[] {
        return CodyStatusError._errors
    }

    static dispose() {
        for (const error of CodyStatusError._errors) {
            error.onDidChangeErrors.dispose()
        }
        CodyStatusError._errors = []
    }
}

const ONE_HOUR = 60 * 60 * 1000
