import { ConfigurationWithAccessToken } from '../configuration'
import { SourcegraphGraphQLAPIClient } from '../sourcegraph-api/graphql'

export interface ExtensionDetails {
    ide: 'VSCode' | 'JetBrains' | 'Neovim' | 'Emacs'
    ideExtensionType: 'Cody' | 'CodeSearch'

    /** Version number for the extension. */
    version: string
}

/**
 * An event's properties.
 */
export interface TelemetryEventProperties {
    [key: string]:
        | string
        | number
        | boolean
        | null
        | undefined
        | string[]
        | { [key: string]: string | number | boolean | null | undefined }
}

export class EventLogger {
    private gqlAPIClient: SourcegraphGraphQLAPIClient

    constructor(
        private serverEndpoint: string,
        private extensionDetails: ExtensionDetails,
        private config: ConfigurationWithAccessToken
    ) {
        this.gqlAPIClient = new SourcegraphGraphQLAPIClient(this.config)
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
    }

    /**
     * Log a telemetry event.
     *
     * PRIVACY: Do NOT include any potentially private information in `eventProperties`. These
     * properties may get sent to analytics tools, so must not include private information, such as
     * search queries or repository names.
     *
     * @param eventName The name of the event.
     * @param anonymousUserID The randomly generated unique user ID.
     * @param properties Event properties. Do NOT include any private information, such as full
     * URLs that may contain private repository names or search queries.
     */
    public log(eventName: string, anonymousUserID: string, properties?: TelemetryEventProperties): void {
        const publicArgument = {
            ...properties,
            serverEndpoint: this.serverEndpoint,
            extensionDetails: this.extensionDetails,
            configurationDetails: {
                contextSelection: this.config.useContext,
                chatPredictions: this.config.experimentalChatPredictions,
                inline: this.config.inlineChat,
                nonStop: this.config.experimentalNonStop,
                guardrails: this.config.experimentalGuardrails,
            },
            version: this.extensionDetails.version, // for backcompat
        }
        this.gqlAPIClient
            .logEvent({
                event: eventName,
                userCookieID: anonymousUserID,
                source: 'IDEEXTENSION',
                url: '',
                argument: '{}',
                publicArgument: JSON.stringify(publicArgument),
            })
            .catch(error => {
                console.log(error)
            })
    }
}
