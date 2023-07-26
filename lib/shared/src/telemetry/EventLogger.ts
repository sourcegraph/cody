import { ConfigurationWithAccessToken } from '../configuration'
import { SourcegraphGraphQLAPIClient } from '../sourcegraph-api/graphql'

export interface ExtensionDetails {
    ide: 'VSCode' | 'JetBrains' | 'Neovim' | 'Emacs'
    ideExtensionType: 'Cody' | 'CodeSearch'
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
     * @param eventProperties Event properties. This may contain private info such as repository
     * names or search queries. If audit logging is enabled, this data is stored on the associated
     * Sourcegraph instance.
     * @param publicProperties Event properties that include only public information. Do NOT include
     * any private information, such as full URLs that may contain private repository names or
     * search queries.
     */
    public log(
        eventName: string,
        anonymousUserID: string,
        eventProperties?: TelemetryEventProperties,
        publicProperties?: TelemetryEventProperties
    ): void {
        const configurationDetails = {
            contextSelection: this.config.useContext,
            chatPredictions: this.config.experimentalChatPredictions,
            inline: this.config.inlineChat,
            nonStop: this.config.experimentalNonStop,
            guardrails: this.config.experimentalGuardrails,
        }
        const argument = {
            ...eventProperties,
            serverEndpoint: this.serverEndpoint,
            extensionDetails: this.extensionDetails,
            configurationDetails,
        }
        const publicArgument = {
            ...publicProperties,
            serverEndpoint: this.serverEndpoint,
            extensionDetails: this.extensionDetails,
            configurationDetails,
        }
        this.gqlAPIClient
            .logEvent({
                event: eventName,
                userCookieID: anonymousUserID,
                source: 'IDEEXTENSION',
                url: '',
                argument: JSON.stringify(argument),
                publicArgument: JSON.stringify(publicArgument),
            })
            .then(() => {})
            .catch(error => {
                console.log(error)
            })
    }
}
