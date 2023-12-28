import { describe, expect, it } from 'vitest'

import { TelemetryEventInput } from '@sourcegraph/telemetry'

import { handleExportModeTransforms } from './GraphQLTelemetryExporter'

describe('handleExportModeTransforms', () => {
    const timestamp = new Date().toISOString()

    it('5.2.0-5.2.1', () => {
        const events: TelemetryEventInput[] = [
            {
                timestamp,
                action: 'Foo',
                feature: 'Bar',
                parameters: {
                    version: 0,
                    interactionID: 'abcde',
                    metadata: [
                        {
                            key: 'foo',
                            value: 1.234,
                        },
                    ],
                    privateMetadata: {
                        foo: 'bar',
                    },
                },
                source: { client: 'vscode', clientVersion: '1.2.3' },
            },
        ]

        handleExportModeTransforms('5.2.0-5.2.1', events)

        // Modified
        expect(events[0].timestamp).toBeUndefined()
        expect(events[0].parameters.privateMetadata).toBeUndefined()
        expect(events[0].parameters.metadata?.pop()?.value).toBe(1)
        expect(events[0].parameters.interactionID).toBeUndefined()
    })

    it('5.2.2-5.2.3', () => {
        const events: TelemetryEventInput[] = [
            {
                timestamp,
                action: 'Foo',
                feature: 'Bar',
                parameters: {
                    version: 0,
                    interactionID: 'abcde',
                    metadata: [
                        {
                            key: 'foo',
                            value: 1.234,
                        },
                    ],
                    privateMetadata: {
                        foo: 'bar',
                    },
                },
                source: { client: 'vscode', clientVersion: '1.2.3' },
            },
        ]

        handleExportModeTransforms('5.2.2-5.2.3', events)

        // Modified
        expect(events[0].timestamp).toBeUndefined()
        expect(events[0].parameters.metadata?.pop()?.value).toBe(1)
        expect(events[0].parameters.interactionID).toBeUndefined()
        // Not modified
        expect(events[0].parameters.privateMetadata).toBeDefined()
    })

    it('5.2.4', () => {
        const events: TelemetryEventInput[] = [
            {
                timestamp,
                action: 'Foo',
                feature: 'Bar',
                parameters: {
                    version: 0,
                    interactionID: 'abcde',
                    metadata: [
                        {
                            key: 'foo',
                            value: 1.234,
                        },
                    ],
                    privateMetadata: {
                        foo: 'bar',
                    },
                },
                source: { client: 'vscode', clientVersion: '1.2.3' },
            },
        ]

        handleExportModeTransforms('5.2.4', events)

        // Modified
        expect(events[0].timestamp).toBeUndefined()

        // Not modified
        expect(events[0].parameters.metadata?.pop()?.value).toBe(1.234)
        expect(events[0].parameters.privateMetadata).toBeDefined()
        expect(events[0].parameters.interactionID).toBe('abcde')
    })

    it('5.2.5+', () => {
        const events: TelemetryEventInput[] = [
            {
                timestamp,
                action: 'Foo',
                feature: 'Bar',
                parameters: {
                    version: 0,
                    interactionID: 'abcde',
                    metadata: [
                        {
                            key: 'foo',
                            value: 1.234,
                        },
                    ],
                    privateMetadata: {
                        foo: 'bar',
                    },
                },
                source: { client: 'vscode', clientVersion: '1.2.3' },
            },
        ]

        handleExportModeTransforms('5.2.5+', events)

        // Modified
        expect(events[0].timestamp).toBe(timestamp)
        expect(events[0].parameters.metadata?.pop()?.value).toBe(1.234)
        expect(events[0].parameters.privateMetadata).toBeDefined()
        expect(events[0].parameters.interactionID).toBe('abcde')
    })
})
