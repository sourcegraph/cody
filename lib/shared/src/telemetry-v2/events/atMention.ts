import { telemetryRecorder } from '../singleton'
import { type Unmapped, event, fallbackValue, pickDefined } from './internal'

export const events = [
    event(
        'cody.at-mention/selected',
        ({ map, maps, action, feature }) =>
            (
                source: Unmapped<typeof maps.source, true>,
                provider: Unmapped<typeof maps.provider> | undefined | null = undefined,
                providerMetadata: { id?: string } | undefined = undefined
            ) => {
                telemetryRecorder.recordEvent(feature, action, {
                    metadata: pickDefined({
                        source: map.source(source),
                        provider:
                            provider !== undefined ? map.provider(provider ?? fallbackValue) : undefined,
                    }),
                    privateMetadata: { source, provider, providerMetadata },
                    billingMetadata: {
                        product: 'cody',
                        category: 'core',
                    },
                })
            },
        {
            source: { chat: 1 },
            provider: {
                [fallbackValue]: 0,
                file: 1,
                symbol: 2,
                repo: 3,
                remoteRepo: 4,
                openctx: 5,
            },
        }
    ),
] as const
