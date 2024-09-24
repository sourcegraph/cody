import {
    REMOTE_DIRECTORY_PROVIDER_URI,
    REMOTE_FILE_PROVIDER_URI,
    REMOTE_REPOSITORY_PROVIDER_URI,
    WEB_PROVIDER_URI,
} from '../../context/openctx/api'
import { FILE_CONTEXT_MENTION_PROVIDER, SYMBOL_CONTEXT_MENTION_PROVIDER } from '../../mentions/api'
import { telemetryRecorder } from '../singleton'
import { type Unmapped, event, fallbackValue, pickDefined } from './internal'

export const events = [
    event(
        'cody.at-mention/selected',
        ({ map, maps, action, feature }) =>
            (
                source: Unmapped<typeof maps.source, true>,
                provider: Unmapped<typeof maps.provider> | undefined | null = undefined
            ) => {
                telemetryRecorder.recordEvent(feature, action, {
                    metadata: pickDefined({
                        source: map.source(source),
                        provider: provider ? map.provider(provider) : undefined,
                    }),
                    privateMetadata: { source, provider },
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
                [FILE_CONTEXT_MENTION_PROVIDER.id]: 1,
                [SYMBOL_CONTEXT_MENTION_PROVIDER.id]: 2,
                [REMOTE_REPOSITORY_PROVIDER_URI]: 3,
                [REMOTE_FILE_PROVIDER_URI]: 4,
                [REMOTE_DIRECTORY_PROVIDER_URI]: 5,
                [WEB_PROVIDER_URI]: 6,
                'https://openctx.org/npm/@openctx/provider-github': 7,
                'https://openctx.org/npm/@openctx/provider-confluence': 7,
                'https://openctx.org/npm/@openctx/provider-jira-issues': 7,
                'https://openctx.org/npm/@openctx/provider-slack': 7,
                'https://openctx.org/npm/@openctx/provider-linear-issues': 7,
                'https://openctx.org/npm/@openctx/provider-linear-docs': 7,
                'https://openctx.org/npm/@openctx/provider-web': 7,
                'https://openctx.org/npm/@openctx/provider-google-docs': 7,
                'https://openctx.org/npm/@openctx/provider-sentry': 7,
                'https://openctx.org/npm/@openctx/provider-notion': 7,
                'https://openctx.org/npm/@openctx/provider-hello-world': 7,
                'https://openctx.org/npm/@openctx/provider-devdocs': 7,
                'https://openctx.org/npm/@openctx/provider-sourcegraph-search': 7,
            },
        }
    ),
] as const
