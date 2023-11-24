import { SourcegraphGraphQLAPIClient } from '@sourcegraph/cody-shared/src/sourcegraph-api/graphql'
import { GraphQLTelemetryExporter } from '@sourcegraph/cody-shared/src/sourcegraph-api/telemetry/GraphQLTelemetryExporter'
import { BillingCategory, BillingProduct } from '@sourcegraph/cody-shared/src/telemetry-v2'
import {
    defaultEventRecordingOptions,
    MarketingTrackingProvider,
    MarketingTrackingTelemetryProcessor,
    TelemetryRecorderProvider,
} from '@sourcegraph/telemetry'

import { ClientInfo } from '../protocol-alias'

/**
 * Default implementation of a TelemetryRecorderProvider for use in the Agent
 * handler only.
 */
export class AgentHandlerTelemetryRecorderProvider extends TelemetryRecorderProvider<BillingProduct, BillingCategory> {
    constructor(
        graphql: SourcegraphGraphQLAPIClient,
        clientInfo: ClientInfo,
        marketingTrackingProvider: MarketingTrackingProvider
    ) {
        super(
            {
                client: clientInfo.name,
                clientVersion: clientInfo.version,
            },
            new GraphQLTelemetryExporter(graphql, clientInfo.extensionConfiguration?.anonymousUserID || '', 'all'),
            [new MarketingTrackingTelemetryProcessor(marketingTrackingProvider)],
            {
                ...defaultEventRecordingOptions,
                bufferTimeMs: 0, // disable buffering for now
            }
        )
    }
}
