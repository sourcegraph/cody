import * as vscode from 'vscode'
import type { StatusBarErrorName } from './types'

const ONE_HOUR = 60 * 60 * 1000

/**
 * It is used to create and manage status bar errors that can be displayed to the user.
 * Represents a status bar error that can be displayed and managed.
 *
 * Each `CodyStatusError` instance has a title, description, error type, and options to control how the error is displayed and removed.
 * The errors are stored in a static array and are automatically cleared after a certain time or when they are manually removed.
 */
export class CodyStatusError {
    private createdAt = Date.now()

    private static _errors: CodyStatusError[] = []

    public onDidChangeErrors = new vscode.EventEmitter()
    public _onDidChangeErrors = this.onDidChangeErrors.event

    constructor(
        public title: string,
        public description: string,
        public errorType: StatusBarErrorName,
        public removeAfterSelected: boolean,
        public removeAfterEpoch?: number,
        public onShow?: () => void,
        public onSelect?: () => void
    ) {}

    static get errors(): CodyStatusError[] {
        return CodyStatusError._errors
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

    static add(error: CodyStatusError) {
        CodyStatusError._errors.push(error)

        setTimeout(
            CodyStatusError.clearOutdatedErrors,
            error.removeAfterEpoch && error.removeAfterEpoch > error.createdAt
                ? Math.min(ONE_HOUR, error.removeAfterEpoch - error.createdAt)
                : ONE_HOUR
        )

        return () => {
            const index = CodyStatusError._errors.indexOf(error)
            if (index !== -1) {
                CodyStatusError._errors.splice(index, 1)
            }
        }
    }

    static remove(error: CodyStatusError) {
        const index = CodyStatusError._errors.indexOf(error)
        if (index !== -1) {
            CodyStatusError._errors.splice(index, 1)
        }
    }

    static dispose() {
        for (const error of CodyStatusError._errors) {
            error.onDidChangeErrors.dispose()
        }
        CodyStatusError._errors = []
    }
}
