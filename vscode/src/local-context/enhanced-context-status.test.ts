import { expect } from '@playwright/test'
import { describe, it } from 'vitest'
import * as vscode from 'vscode'

import * as status from '@sourcegraph/cody-shared/src/codebase-context/context-status'

import { ContextStatusAggregator } from './enhanced-context-status'

class TestProvider implements status.ContextStatusProvider {
    public emitter: vscode.EventEmitter<status.ContextStatusProvider> = new vscode.EventEmitter()

    constructor(private status_: status.ContextGroup[] | undefined = undefined) {}

    public onDidChangeStatus(callback: (provider: status.ContextStatusProvider) => void): vscode.Disposable {
        return this.emitter.event(callback)
    }

    public get status(): status.ContextGroup[] {
        return (
            this.status_ || [
                {
                    name: 'github.com/foo/bar',
                    providers: [
                        {
                            kind: 'embeddings',
                            type: 'local',
                            state: 'unconsented',
                        },
                    ],
                },
            ]
        )
    }
    public set status(status: status.ContextGroup[]) {
        this.status_ = status
    }
}

describe('ContextStatusAggregator', () => {
    it('should fire status changed when providers are added and pass through simple status', async () => {
        const aggregator = new ContextStatusAggregator()
        const promise = new Promise(resolve => {
            aggregator.onDidChangeStatus(provider => resolve(provider.status))
        })
        aggregator.addProvider(new TestProvider())
        expect(await promise).toEqual([
            {
                name: 'github.com/foo/bar',
                providers: [
                    {
                        kind: 'embeddings',
                        type: 'local',
                        state: 'unconsented',
                    },
                ],
            },
        ])
        aggregator.dispose()
    })
    it('should fire aggregate status from multiple providers', async () => {
        const aggregator = new ContextStatusAggregator()
        let callbackCount = 0
        const promise = new Promise(resolve => {
            aggregator.onDidChangeStatus(provider => {
                callbackCount++
                resolve(provider.status)
            })
        })
        aggregator.addProvider(new TestProvider())
        aggregator.addProvider(
            new TestProvider([
                {
                    name: 'host.example/foo',
                    providers: [{ kind: 'graph', state: 'ready' }],
                },
                {
                    name: 'github.com/foo/bar',
                    providers: [
                        {
                            kind: 'embeddings',
                            type: 'remote',
                            state: 'ready',
                            origin: 'sourcegraph.com',
                            remoteName: 'github.com/foo/bar',
                        },
                    ],
                },
            ])
        )
        expect(await promise).toEqual([
            {
                name: 'github.com/foo/bar',
                providers: [
                    {
                        kind: 'embeddings',
                        type: 'local',
                        state: 'unconsented',
                    },
                    {
                        kind: 'embeddings',
                        type: 'remote',
                        state: 'ready',
                        origin: 'sourcegraph.com',
                        remoteName: 'github.com/foo/bar',
                    },
                ],
            },
            {
                name: 'host.example/foo',
                providers: [{ kind: 'graph', state: 'ready' }],
            },
        ])
        // Not only does it aggregate status, it coalesces update events
        expect(callbackCount).toBe(1)
        aggregator.dispose()
    })
    it('should respond to child events by firing an event of its own', async () => {
        const aggregator = new ContextStatusAggregator()
        const provider = new TestProvider()
        aggregator.addProvider(provider)
        // Skip the first update event.
        await Promise.resolve()
        let callbackCount = 0
        const promise = new Promise(resolve => {
            aggregator.onDidChangeStatus(provider => {
                callbackCount++
                resolve(provider.status)
            })
        })
        provider.status = [{ name: 'github.com/foo/bar', providers: [{ kind: 'graph', state: 'indexing' }] }]
        provider.emitter.fire(provider)

        expect(await promise).toEqual([
            {
                name: 'github.com/foo/bar',
                providers: [
                    {
                        kind: 'graph',
                        state: 'indexing',
                    },
                ],
            },
        ])
        expect(callbackCount).toBe(1)
    })
})
