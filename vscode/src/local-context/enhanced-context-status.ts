import * as vscode from 'vscode'

import { ContextGroup, ContextStatusProvider } from '@sourcegraph/cody-shared/src/codebase-context/context-status'

import { logDebug } from '../log'

// Collects context status from a set of ContextStatusProviders and produces
// a merged status view.
export class ContextStatusAggregator implements vscode.Disposable, ContextStatusProvider {
    private static TAG = 'ContextStatusAggregator'
    private disposables: Set<vscode.Disposable> = new Set()
    private statusEmitter: vscode.EventEmitter<ContextStatusProvider> = new vscode.EventEmitter<ContextStatusProvider>()
    private providerStatusMap: Map<ContextStatusProvider, ContextGroup[] | 'needs-status'> | undefined = new Map()

    // Whether we have been notified of status changes, but are yet to pass that
    // notification on. We do this to de-bounce updates from multiple status
    // providers in one turn of the event loop.
    private pendingPublish = false

    // Disposes this ContextStatusAggregator.
    public dispose(): void {
        for (const disposable of this.disposables) {
            disposable.dispose()
        }
        this.providerStatusMap = undefined
    }

    // Adds a provider to this ContextStatusAggregator. The aggregator will
    // subscribe to the provider and aggregate its updates into a merged status.
    // To remove this provider, dispose of the returned disposable.
    //
    // If the provider is disposable, it should dispose of the registration in
    // its dispose method. Otherwise this ContextStatusAggregator may continue
    // to poll its status property, and show its status in the aggregate status.
    public addProvider(provider: ContextStatusProvider): vscode.Disposable {
        if (this.providerStatusMap === undefined) {
            throw new Error('ContextStatusPublisher has been disposed')
        }
        const disposable = provider.onDidChangeStatus(putativeProvider => {
            if (provider !== putativeProvider) {
                logDebug(ContextStatusAggregator.TAG, 'got onDidChangeStatus event but passed mismatched provider')
            }
            this.providerDidChangeStatus(provider)
        })
        this.disposables.add(disposable)
        this.providerStatusMap.set(provider, 'needs-status')
        this.providerDidChangeStatus(provider)
        return {
            dispose: (): void => {
                if (this.providerStatusMap) {
                    this.providerStatusMap.delete(provider)
                    this.disposables.delete(disposable)
                    disposable.dispose()
                    this.publishStatus()
                }
            },
        }
    }

    // Records that the provider's state is dirty, and schedules an update.
    private providerDidChangeStatus(provider: ContextStatusProvider): void {
        if (this.providerStatusMap === undefined) {
            // We have been disposed
            return
        }
        if (!this.providerStatusMap.has(provider)) {
            // The provider has been removed. This should not happen if the
            // providers are following the dispose protocol.
            return
        }
        // Record that we need to get provider status next update.
        this.providerStatusMap.set(provider, 'needs-status')
        // Schedule an update.
        this.publishStatus()
    }

    // Aggregates and publishes status asynchronously. Multiple context status
    // providers updating "at once" will be coalesced into one update.
    private publishStatus(): void {
        if (this.pendingPublish) {
            // Coalesce multiple updates.
            return
        }
        this.pendingPublish = true
        void Promise.resolve().then(() => {
            this.pendingPublish = false
            this.statusEmitter.fire(this)
        })
    }

    // ContextStatusProvider implementation of onDidChangeStatus. The
    // ContextStatusAggregator can be stacked to combine per-workspace and
    // per-chat context status.
    public onDidChangeStatus(callback: (sender: ContextStatusProvider) => void): vscode.Disposable {
        return this.statusEmitter.event(callback)
    }

    // Computes the merged context status. This may throw if any of the
    // aggregated providers' status throw.
    public get status(): ContextGroup[] {
        if (this.providerStatusMap === undefined) {
            throw new Error('ContextStatusPublisher has been disposed')
        }
        const groupBy: { [name: string]: ContextGroup } = {}
        // Iterate through provider status map entries
        for (let [provider, status] of this.providerStatusMap.entries()) {
            if (status === 'needs-status') {
                // The provider's status is stale; poll it.
                status = provider.status
                if (this.providerStatusMap.get(provider) !== 'needs-status') {
                    logDebug(
                        ContextStatusAggregator.TAG,
                        'ContextStatusProvider.status should only report status, not change state',
                        provider
                    )
                }
                // Deep clone the status object so providers can't continue to change it without notifying.
                status = JSON.parse(JSON.stringify(status)) as ContextGroup[]
                // Cache the status so we don't re-poll this provider unless it changes.
                this.providerStatusMap.set(provider, status)
            }

            // Collect context groups by name
            for (const group of status) {
                if (group.name in groupBy) {
                    // Merge the items in the group.
                    groupBy[group.name].providers.push(...group.providers)
                } else {
                    // Create a new group for the merged result.
                    groupBy[group.name] = {
                        name: group.name,
                        providers: [...group.providers],
                    }
                }
            }
        }
        // Order sources within the groups by a canonical order
        for (const groups of Object.values(groupBy)) {
            // Sort by a fixed locale for consistency. The 'kind' key is not a
            // localized UI label.
            groups.providers.sort((a, b) => a.kind.localeCompare(b.kind, 'en-US'))
        }
        return [...Object.values(groupBy)]
    }

    // TODO: Create a publisher to push into the webview
    // TODO: Hook in local embeddings
    // TODO: Hook in cloud embeddings
    // TODO: Hook in symf
    // TODO: Hook in graph
    // TODO: Hook in the Cody: building code index ... notification pusher's
    // state
}
