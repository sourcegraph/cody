import {
    TelemetryRecorderProvider as BaseTelemetryRecorderProvider,
    defaultEventRecordingOptions,
    NoOpTelemetryExporter,
    TelemetryEventInput,
    TelemetryProcessor,
} from '@sourcegraph/telemetry'

import { ConfigurationWithAccessToken, getContextSelectionID } from '../configuration'
import { SourcegraphGraphQLAPIClient } from '../sourcegraph-api/graphql'
import { GraphQLTelemetryExporter } from '../sourcegraph-api/telemetry/GraphQLTelemetryExporter'
import { MockServerTelemetryExporter } from '../sourcegraph-api/telemetry/MockServerTelemetryExporter'

import { BillingCategory, BillingProduct, EventAction, EventFeature, MetadataKey } from '.'

export interface ExtensionDetails {
    ide: 'VSCode' | 'JetBrains' | 'Neovim' | 'Emacs'
    ideExtensionType: 'Cody' | 'CodeSearch'

    /** Version number for the extension. */
    version: string
}

/**
 * TelemetryRecorderProvider is the default provider implementation.
 */
export class TelemetryRecorderProvider extends BaseTelemetryRecorderProvider<
    EventFeature,
    EventAction,
    MetadataKey,
    BillingCategory,
    BillingProduct
> {
    constructor(extensionDetails: ExtensionDetails, config: ConfigurationWithAccessToken, anonymousUserID: string) {
        const client = new SourcegraphGraphQLAPIClient(config)
        super(
            {
                client: `${extensionDetails.ide}.${extensionDetails.ideExtensionType}`,
                clientVersion: extensionDetails.version,
            },
            new GraphQLTelemetryExporter(client, anonymousUserID),
            [new ConfigurationMetadataProcessor(config)],
            {
                ...defaultEventRecordingOptions,
                bufferTimeMs: 0, // disable buffering for now
            }
        )
    }
}

/**
 * TelemetryRecorder is the type of recorders returned by
 * TelemetryRecorderProviders in this module. It's available as a type to work
 * around type reference issues like:
 *
 *   The inferred type of 'telemetryRecorder' cannot be named without a reference <...>
 */
export type TelemetryRecorder = typeof noOpTelemetryRecorder

export class NoOpTelemetryRecorderProvider extends BaseTelemetryRecorderProvider<
    EventFeature,
    EventAction,
    MetadataKey,
    BillingCategory,
    BillingProduct
> {
    constructor() {
        super({ client: '' }, new NoOpTelemetryExporter(), [])
    }
}

export const noOpTelemetryRecorder = new NoOpTelemetryRecorderProvider().getRecorder()

/**
 * MockServerTelemetryRecorderProvider uses MockServerTelemetryExporter to export
 * events.
 */
export class MockServerTelemetryRecorderProvider extends BaseTelemetryRecorderProvider<
    EventFeature,
    EventAction,
    MetadataKey,
    BillingCategory,
    BillingProduct
> {
    constructor(extensionDetails: ExtensionDetails, config: ConfigurationWithAccessToken, anonymousUserID: string) {
        super(
            {
                client: `${extensionDetails.ide}.${extensionDetails.ideExtensionType}`,
                clientVersion: extensionDetails.version,
            },
            new MockServerTelemetryExporter(anonymousUserID),
            [new ConfigurationMetadataProcessor(config)]
        )
    }
}

/**
 * ConfigurationMetadataProcessor turns config into metadata that is
 * automatically attached to all events.
 */
class ConfigurationMetadataProcessor implements TelemetryProcessor {
    constructor(private config: ConfigurationWithAccessToken) {}

    public processEvent(event: TelemetryEventInput): void {
        if (!event.parameters.metadata) {
            event.parameters.metadata = []
        }
        event.parameters.metadata.push(
            {
                key: 'contextSelection',
                value: getContextSelectionID(this.config.useContext),
            },
            {
                key: 'chatPredictions',
                value: this.config.experimentalChatPredictions ? 1 : 0,
            },
            {
                key: 'inline',
                value: this.config.inlineChat ? 1 : 0,
            },
            {
                key: 'nonStop',
                value: this.config.experimentalNonStop ? 1 : 0,
            },
            {
                key: 'guardrails',
                value: this.config.experimentalGuardrails ? 1 : 0,
            }
        )
    }
}
