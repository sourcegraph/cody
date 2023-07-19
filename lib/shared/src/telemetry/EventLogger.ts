import { SourcegraphGraphQLAPIClient } from '../sourcegraph-api/graphql'

export type ExtensionDetails = {
    ide: 'VSCode' | 'JetBrains' | 'Neovim' | 'Emacs'
    ideExtensionType: 'Cody' | 'CodeSearch'
}

export type ConfigurationDetails = {
    contextSelection: string
    chatPredictions: boolean
    inline: boolean
    nonStop: boolean
    guardrails: boolean
}

export class EventLogger {
    public constructor(private gqlAPIClient: SourcegraphGraphQLAPIClient, private serverEndpoint: string, private extensionDetails: ExtensionDetails, private configurationDetails: ConfigurationDetails) { }

    public onConfigurationChange(serverEndpoint: string, extensionDetails: ExtensionDetails, configurationDetails: ConfigurationDetails): void {
        this.serverEndpoint = serverEndpoint
        this.extensionDetails = extensionDetails
        this.configurationDetails = configurationDetails
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
        const argument = {
            ...eventProperties,
            serverEndpoint: this.serverEndpoint,
            extensionDetails: this.extensionDetails,
            configurationDetails: this.configurationDetails,
        }
        const publicArgument = {
            ...publicProperties,
            serverEndpoint: this.serverEndpoint,
            extensionDetails: this.extensionDetails,
            configurationDetails: this.configurationDetails,
        }
        try {
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
                .catch(() => {})
        } catch (error) {
            console.log(error)
        }
    }
}
