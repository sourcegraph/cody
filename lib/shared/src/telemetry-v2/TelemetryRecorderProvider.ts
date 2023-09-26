import {
    TelemetryRecorderProvider as BaseTelemetryRecorderProvider,
    defaultEventRecordingOptions,
} from '@sourcegraph/telemetry'
import { TelemetryEventInput } from '@sourcegraph/telemetry/dist/api'
import { TelemetryProcessor } from '@sourcegraph/telemetry/dist/processors'

import { ConfigurationWithAccessToken, getContextSelectionID } from '../configuration'
import { SourcegraphGraphQLAPIClient } from '../sourcegraph-api/graphql'
import { GraphQLTelemetryExporter } from '../sourcegraph-api/telemetry/exporter'

import { BillingCategory, BillingProduct, EventAction, EventFeature, MetadataKey } from '.'

export interface ExtensionDetails {
    ide: 'VSCode' | 'JetBrains' | 'Neovim' | 'Emacs'
    ideExtensionType: 'Cody' | 'CodeSearch'

    /** Version number for the extension. */
    version: string
}

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

class ConfigurationMetadataProcessor implements TelemetryProcessor {
    constructor(private config: ConfigurationWithAccessToken) {}

    public processEvent(event: TelemetryEventInput): void {
        if (!event.parameters.metadata) {
            event.parameters.metadata = []
        }
        if (!event.parameters.privateMetadata) {
            event.parameters.privateMetadata = {}
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
