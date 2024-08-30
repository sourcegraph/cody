import {
    TelemetryRecorderProvider as BaseTelemetryRecorderProvider,
    NoOpTelemetryExporter,
    type TelemetryEventInput,
    type TelemetryExporter,
    type TelemetryProcessor,
    TestTelemetryExporter,
    defaultEventRecordingOptions,
} from '@sourcegraph/telemetry'
import { TimestampTelemetryProcessor } from '@sourcegraph/telemetry/dist/processors/timestamp'

import {
    CONTEXT_SELECTION_ID,
    type ClientConfiguration,
    type ClientConfigurationWithAccessToken,
    type CodyIDE,
} from '../configuration'
import { type LogEventMode, graphqlClient } from '../sourcegraph-api/graphql/client'
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
        config: ClientConfigurationWithAccessToken,
        authStatusProvider: AuthStatusProvider,
        anonymousUserID: string,
        legacyBackcompatLogEventMode: LogEventMode
    ) {
        graphqlClient.setConfig(config)
        const clientName = extensionDetails.telemetryClientName
            ? extensionDetails.telemetryClientName
            : `${extensionDetails.ide || 'unknown'}.Cody`

        super(
            {
                client: clientName,
                clientVersion: extensionDetails.version,
            },
            process.env.CODY_TELEMETRY_EXPORTER === 'testing'
                ? TESTING_TELEMETRY_EXPORTER.withAnonymousUserID(anonymousUserID)
                : new GraphQLTelemetryExporter(anonymousUserID, legacyBackcompatLogEventMode),
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

// This is a special type that is only used in testing to allow for access to anonymousUserID
type TestTelemetryEventInput = TelemetryEventInput & { testOnlyAnonymousUserID: string }

// creating a delegate to the TESTING_TELEMETRY_EXPORTER to allow for easy access to exported events.
// This instance must be shared for a consistent view of what has been exported.
class DelegateTelemetryExporter implements TelemetryExporter {
    private exportedEvents: TestTelemetryEventInput[] = []
    // default to unset to make it clear when it's not set
    private anonymousUserID = 'unset'

    constructor(public delegate: TestTelemetryExporter) {}
    async exportEvents(events: TelemetryEventInput[]): Promise<void> {
        this.exportedEvents.push(
            ...events.map(event => ({
                ...event,
                testOnlyAnonymousUserID: this.anonymousUserID,
            }))
        )
        await this.delegate.exportEvents(events)
    }

    withAnonymousUserID(anonymousUserID: string): DelegateTelemetryExporter {
        this.anonymousUserID = anonymousUserID
        return this
    }

    getExported(): TestTelemetryEventInput[] {
        return [...this.exportedEvents]
    }

    reset(): void {
        this.exportedEvents = []
    }
}
export const TESTING_TELEMETRY_EXPORTER = new DelegateTelemetryExporter(new TestTelemetryExporter())

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
        config: ClientConfiguration,
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
        private config: ClientConfiguration,
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
