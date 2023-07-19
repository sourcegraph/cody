import { ConfigurationWithAccessToken, EventLoggerConfigurationDetails } from '../configuration'
import { SourcegraphGraphQLAPIClient } from '../sourcegraph-api/graphql'

export class EventLogger {
    private extensionDetails = { ide: 'VSCode', ideExtensionType: 'Cody' }
    public configurationDetails: EventLoggerConfigurationDetails
    constructor(
        private gqlAPIClient: SourcegraphGraphQLAPIClient,
        private config: ConfigurationWithAccessToken
    ) {
        this.configurationDetails = this.onConfigurationChange(config)
    }

    public onConfigurationChange(newConfig: ConfigurationWithAccessToken): EventLoggerConfigurationDetails {
        this.config = newConfig
        const configDetails = {
            contextSelection: newConfig.useContext,
            chatPredictions: newConfig.experimentalChatPredictions,
            inline: newConfig.inlineChat,
            nonStop: newConfig.experimentalNonStop,
            suggestions: newConfig.autocomplete,
            guardrails: newConfig.experimentalGuardrails,
            customRecipes: newConfig.experimentalCustomRecipes,
        }
        this.configurationDetails = configDetails
        return configDetails
    }

    private get(): { endpoint: string; configurationDetails: EventLoggerConfigurationDetails } {
        return { endpoint: this.config.serverEndpoint, configurationDetails: this.configurationDetails }
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
        const { endpoint, configurationDetails } = this.get()
        const logProperties = {
            serverEndpoint: this.config.serverEndpoint,
            extensionDetails: this.extensionDetails,
            configurationDetails,
        }
        const argument = { ...eventProperties, ...logProperties }
        const publicArgument = { ...publicProperties, ...logProperties }
        this.gqlAPIClient
            .logEvent({
                event: eventName,
                userCookieID: anonymousUserID,
                source: 'IDEEXTENSION',
                url: endpoint,
                argument: JSON.stringify(argument),
                publicArgument: JSON.stringify(publicArgument),
            })
            .catch(error => console.log(error))
    }
}
