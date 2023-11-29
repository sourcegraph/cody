import { describe, expect, it } from 'vitest'

import { TelemetryEventInput } from '@sourcegraph/telemetry'

import { ExportMode, handleExportModeTransforms } from './GraphQLTelemetryExporter'

describe('handleExportModeTransforms', () => {
    it('pre-5.2.2', () => {
        const events: TelemetryEventInput[] = [
            {
                action: 'Foo',
                feature: 'Bar',
                parameters: {
                    version: 0,
                    privateMetadata: {
                        foo: 'bar',
                    },
                },
                source: { client: 'vscode', clientVersion: '1.2.3' },
            },
        ]

        handleExportModeTransforms('5.2.0-5.2.1', events)

        expect(events[0].parameters.privateMetadata).toBeUndefined()
    })

    it('5.2.0 to 5.2.4', () => {
        const testModes: ExportMode[] = ['5.2.0-5.2.1', '5.2.2-5.2.3']
        for (const mode of testModes) {
            const events: TelemetryEventInput[] = [
                {
                    action: 'Foo',
                    feature: 'Bar',
                    parameters: {
                        version: 0,
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

            handleExportModeTransforms(mode, events)

            expect(events[0].parameters.metadata?.pop()?.value).toBe(1)
        }
    })
})
