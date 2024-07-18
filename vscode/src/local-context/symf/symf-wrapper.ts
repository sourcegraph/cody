import { type AuthStatus, isAuthenticated, isEnterpriseUser } from '@sourcegraph/cody-shared'
import type * as vscode from 'vscode'
import type { SymfRunner } from './symf-runner'

export class SymfWrapper implements vscode.Disposable {
    public runner: SymfRunner | undefined
    private hasRun = false

    constructor(private ctor: () => SymfRunner | undefined) {}

    public syncAuthStatus(status: AuthStatus) {
        if (!this.hasRun && isAuthenticated(status) && !isEnterpriseUser(status)) {
            this.hasRun = true
            this.runner = this.ctor()
        }
    }

    public dispose() {
        this.runner?.dispose()
    }
}
