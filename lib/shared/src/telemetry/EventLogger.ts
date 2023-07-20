import { ConfigurationWithAccessToken } from '../configuration'
import { SourcegraphGraphQLAPIClient } from '../sourcegraph-api/graphql'

export interface ExtensionDetails {
    ide: 'VSCode' | 'JetBrains' | 'Neovim' | 'Emacs'
    ideExtensionType: 'Cody' | 'CodeSearch'
}

export class EventLogger {
    private gqlAPIClient: SourcegraphGraphQLAPIClient

    constructor(private serverEndpoint: string, private extensionDetails: ExtensionDetails, private config: ConfigurationWithAccessToken) {
        this.gqlAPIClient = new SourcegraphGraphQLAPIClient(this.config)
    }

    public onConfigurationChange(newServerEndpoint: string, newExtensionDetails: ExtensionDetails, newConfig: ConfigurationWithAccessToken): void {
        this.serverEndpoint = newServerEndpoint
        this.extensionDetails = newExtensionDetails
        this.config = newConfig
    }

    /**
     * Logs an event.
     *
     * PRIVACY: Do NOT include any potentially private information in this
     * field. These properties get sent to our analytics tools for Cloud, so
     * must not include private information, such as search queries or
     * repository names.
     *
     * @param eventName The name of the event.
     * @param anonymousUserID The randomly generated unique user ID.
     * @param eventProperties The additional argument information.
     * @param publicProperties Public argument information.
     */
    public log(eventName: string, anonymousUserID: string, eventProperties?: any, publicProperties?: any): void {
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
            .catch(error => { console.log(error) })
    }
}
