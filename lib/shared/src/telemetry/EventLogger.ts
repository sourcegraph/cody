import { ConfigurationWithAccessToken } from '../configuration'
import { SourcegraphGraphQLAPIClient } from '../sourcegraph-api/graphql'
import { isError } from '../utils'

import { TelemetryEventProperties } from '.'

export interface ExtensionDetails {
    ide: 'VSCode' | 'JetBrains' | 'Neovim' | 'Emacs'
    ideExtensionType: 'Cody' | 'CodeSearch'
    platform: string
    arch?: string

    /** Version number for the extension. */
    version: string
}

export class EventLogger {
    private gqlAPIClient: SourcegraphGraphQLAPIClient
    private client: string
    private siteIdentification?: { siteid: string; hashedLicenseKey: string }

    constructor(
        private serverEndpoint: string,
        private extensionDetails: ExtensionDetails,
        private config: ConfigurationWithAccessToken
    ) {
        this.gqlAPIClient = new SourcegraphGraphQLAPIClient(this.config)
        this.setSiteIdentification().catch(error => console.error(error))
        if (this.extensionDetails.ideExtensionType !== 'Cody') {
            throw new Error(`new extension type ${this.extensionDetails.ideExtensionType} not yet accounted for`)
        }

        switch (this.extensionDetails.ide) {
            case 'VSCode':
                this.client = 'VSCODE_CODY_EXTENSION'
                break
            case 'Emacs':
                this.client = 'EMACS_CODY_EXTENSION'
                break
            case 'JetBrains':
                this.client = 'JETBRAINS_CODY_EXTENSION'
                break
            case 'Neovim':
                this.client = 'NEOVIM_CODY_EXTENSION'
                break
            default:
                throw new Error(`new IDE ${this.extensionDetails.ide} not yet accounted for`)
        }
    }

    public onConfigurationChange(
        newServerEndpoint: string,
        newExtensionDetails: ExtensionDetails,
        newConfig: ConfigurationWithAccessToken
    ): void {
        this.serverEndpoint = newServerEndpoint
        this.extensionDetails = newExtensionDetails
        this.config = newConfig
        this.gqlAPIClient.onConfigurationChange(newConfig)
        this.setSiteIdentification().catch(error => console.error(error))
    }

    private async setSiteIdentification(): Promise<void> {
        const siteIdentification = await this.gqlAPIClient.getSiteIdentification()
        if (isError(siteIdentification)) {
            /**
             * Swallow errors. Any instance with a version before https://github.com/sourcegraph/sourcegraph/commit/05184f310f631bb36c6d726792e49ff9d122e4af
             * will return an error here due to it not having new parameters in its GraphQL schema or database schema.
             */
        } else {
            this.siteIdentification = siteIdentification
        }
    }

    /**
     * Log a telemetry event using the legacy event-logging mutations.
     *
     * DEPRECATED: Callsites should ALSO record an event using services/telemetryV2
     * as well and indicate this has happened, for example:
     *
     * logEvent(name, properties, { hasV2Event: true })
     * telemetryRecorder.recordEvent(...)
     *
     * In the future, all usages of TelemetryService will be removed in
     * favour of the new libraries. For more information, see:
     * https://sourcegraph.com/docs/dev/background-information/telemetry
     *
     * PRIVACY: Do NOT include any potentially private information in `eventProperties`. These
     * properties may get sent to analytics tools, so must not include private information, such as
     * search queries or repository names.
     * @param eventName The name of the event.
     * @param anonymousUserID The randomly generated unique user ID.
     * @param properties Event properties. Do NOT include any private information, such as full
     * URLs that may contain private repository names or search queries.
     */
    public log(
        eventName: string,
        anonymousUserID: string,
        properties?: TelemetryEventProperties,
        opts: { hasV2Event?: boolean } = { hasV2Event: false }
    ): void {
        /**
         * hasV2Event can be set via properties or opts, as it's unlikely to be
         * collide with a real property and it's easy to accidentally put opts
         * in the properties field.
         */
        const hasV2Event = opts.hasV2Event || properties?.hasV2Event

        const publicArgument = {
            ...properties,
            serverEndpoint: this.serverEndpoint,
            extensionDetails: this.extensionDetails,
            configurationDetails: {
                contextSelection: this.config.useContext,
                chatPredictions: this.config.experimentalChatPredictions,
                guardrails: this.config.experimentalGuardrails,
            },
            version: this.extensionDetails.version, // for backcompat
            hasV2Event,
        }
        this.gqlAPIClient
            .logEvent(
                {
                    event: eventName,
                    userCookieID: anonymousUserID,
                    source: 'IDEEXTENSION',
                    url: '',
                    argument: '{}',
                    publicArgument: JSON.stringify(publicArgument),
                    client: this.client,
                    connectedSiteID: this.siteIdentification?.siteid,
                    hashedLicenseKey: this.siteIdentification?.hashedLicenseKey,
                },
                /**
                 * If a V2 event is created, the new recorder's exporter will
                 * make sure that the instance receives a copy of the event.
                 * In this case, this event log is only created for backcompat
                 * with existing dotcom data, so we log only to dotcom.
                 */
                hasV2Event ? 'dotcom-only' : 'all'
            )
            .then(response => {
                if (isError(response)) {
                    console.error('Error logging event', response)
                }
            })
            .catch(error => console.error('Error logging event', error))
    }
}
