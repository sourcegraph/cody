import {
    TelemetryRecorderProvider as BaseTelemetryRecorderProvider,
    NoOpTelemetryExporter,
    type TelemetryEventInput,
    type TelemetryProcessor,
    TestTelemetryExporter,
    defaultEventRecordingOptions,
} from '@sourcegraph/telemetry'
import { TimestampTelemetryProcessor } from '@sourcegraph/telemetry/dist/processors/timestamp'

import {
    CONTEXT_SELECTION_ID,
    type CodyIDE,
    type Configuration,
    type ConfigurationWithAccessToken,
} from '../configuration'
import { SourcegraphGraphQLAPIClient } from '../sourcegraph-api/graphql'
import type { LogEventMode } from '../sourcegraph-api/graphql/client'
import { GraphQLTelemetryExporter } from '../sourcegraph-api/telemetry/GraphQLTelemetryExporter'
import { MockServerTelemetryExporter } from '../sourcegraph-api/telemetry/MockServerTelemetryExporter'

import type { BillingCategory, BillingProduct } from '.'
import type { AuthStatusProvider } from '../auth/types'
import { getTier } from './cody-tier'

export interface ExtensionDetails {
    ide: CodyIDE

    /**
     * Platform name, possible values 'linux', 'macos', 'windows',
     * (see vscode os.ts for Platform enum)
     */
    platform: string

    /** Version number for the extension. */
    version: string

    /**
     * If this is provided event recorder will use this name as a client name
     * in telemetry events, primary is used for having different client name for
     * CodyWeb in dotcom/enterprise instances.
     *
     * If it isn't provided we will fall back on ide+ideExtensionType client name
     */
    telemetryClientName: string | undefined

    /**
     * Architecture name, possible values 'arm64', 'aarch64', 'x86_64', 'x64', 'x86'
     * (see vscode os.ts for Arch enum)
     */
    arch?: string
}

/**
 * TelemetryRecorderProvider is the default provider implementation. It sends
 * events directly to a connected Sourcegraph instance.
 *
 * This is NOT meant for use if connecting to an Agent.
 */
export class TelemetryRecorderProvider extends BaseTelemetryRecorderProvider<
    BillingProduct,
    BillingCategory
> {
    constructor(
        extensionDetails: ExtensionDetails,
        config: ConfigurationWithAccessToken,
        authStatusProvider: AuthStatusProvider,
        anonymousUserID: string,
        legacyBackcompatLogEventMode: LogEventMode
    ) {
        const client = new SourcegraphGraphQLAPIClient(config)
        const clientName = extensionDetails.telemetryClientName
            ? extensionDetails.telemetryClientName
            : `${extensionDetails.ide || 'unknown'}.Cody`

        super(
            {
                client: clientName,
                clientVersion: extensionDetails.version,
            },
            process.env.CODY_TELEMETRY_EXPORTER === 'testing'
                ? new TestTelemetryExporter()
                : new GraphQLTelemetryExporter(client, anonymousUserID, legacyBackcompatLogEventMode),
            [
                new ConfigurationMetadataProcessor(config, authStatusProvider),
                // Generate timestamps when recording events, instead of serverside
                new TimestampTelemetryProcessor(),
            ],
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
    BillingProduct,
    BillingCategory
> {
    constructor(processors?: TelemetryProcessor[]) {
        super({ client: '' }, new NoOpTelemetryExporter(), processors || [])
    }
}
/**
 * noOpTelemetryRecorder should ONLY be used in tests - it discards all recorded events and does nothing with them.
 */
export const noOpTelemetryRecorder = new NoOpTelemetryRecorderProvider().getRecorder()

/**
 * MockServerTelemetryRecorderProvider uses MockServerTelemetryExporter to export
 * events.
 */
export class MockServerTelemetryRecorderProvider extends BaseTelemetryRecorderProvider<
    BillingProduct,
    BillingCategory
> {
    constructor(
        extensionDetails: ExtensionDetails,
        config: Configuration,
        authStatusProvider: AuthStatusProvider,
        anonymousUserID: string
    ) {
        super(
            {
                client: `${extensionDetails.ide}.Cody`,
                clientVersion: extensionDetails.version,
            },
            new MockServerTelemetryExporter(anonymousUserID),
            [new ConfigurationMetadataProcessor(config, authStatusProvider)]
        )
    }
}

/**
 * ConfigurationMetadataProcessor turns config into metadata that is
 * automatically attached to all events.
 */
class ConfigurationMetadataProcessor implements TelemetryProcessor {
    constructor(
        private config: Configuration,
        private authStatusProvider: AuthStatusProvider
    ) {}

    public processEvent(event: TelemetryEventInput): void {
        if (!event.parameters.metadata) {
            event.parameters.metadata = []
        }
        event.parameters.metadata.push(
            {
                key: 'contextSelection',
                value: CONTEXT_SELECTION_ID[this.config.useContext],
            },
            {
                key: 'tier',
                value: getTier(this.authStatusProvider.getAuthStatus()),
            }
        )
    }
}
