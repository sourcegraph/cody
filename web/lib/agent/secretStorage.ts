import type { Disposable } from '@sourcegraph/cody-shared'
import type { MessageConnection } from 'vscode-jsonrpc'

/**
 * Register handlers on the agent client to store secrets in {@link localStorage}.
 */
export function registerClientManagedSecretStorage(rpc: MessageConnection): Disposable {
    function localStorageKey(key: string): string {
        return `cody.secret.${key}`
    }

    function getSecret(key: string): string | null {
        return localStorage.getItem(localStorageKey(key))
    }

    function storeSecret(key: string, value: string): void {
        localStorage.setItem(localStorageKey(key), value)
    }

    function deleteSecret(key: string): void {
        localStorage.removeItem(localStorageKey(key))
    }

    const disposables = [
        rpc.onRequest('secrets/get', async ({ key }) => getSecret(key)),
        rpc.onRequest('secrets/store', async ({ key, value }) => storeSecret(key, value)),
        rpc.onRequest('secrets/delete', async ({ key }) => deleteSecret(key)),
    ]
    return {
        dispose: () => {
            for (const disposable of disposables) {
                disposable.dispose()
            }
        },
    }
}
