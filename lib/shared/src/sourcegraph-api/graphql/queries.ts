export const CURRENT_USER_ID_QUERY = `
query CurrentUser {
    currentUser {
        id
    }
}`

export const CURRENT_USER_CODY_PRO_ENABLED_QUERY = `
query CurrentUserCodyProEnabled {
    currentUser {
        codyProEnabled
    }
}`

export const CURRENT_USER_INFO_QUERY = `
query CurrentUser {
    currentUser {
        id
        hasVerifiedEmail
        displayName
        username
        avatarURL
        primaryEmail {
            email
        }
    }
}`

export const CURRENT_SITE_VERSION_QUERY = `
query SiteProductVersion {
    site {
        productVersion
    }
}`

export const CURRENT_SITE_HAS_CODY_ENABLED_QUERY = `
query SiteHasCodyEnabled {
    site {
        isCodyEnabled
    }
}`

export const CURRENT_SITE_GRAPHQL_FIELDS_QUERY = `
query SiteGraphQLFields {
    __type(name: "Site") {
        fields {
            name
        }
    }
}`

export const CURRENT_SITE_CODY_LLM_PROVIDER = `
query CurrentSiteCodyLlmConfiguration {
    site {
        codyLLMConfiguration {
            provider
        }
    }
}`

export const CURRENT_SITE_CODY_LLM_CONFIGURATION = `
query CurrentSiteCodyLlmConfiguration {
    site {
        codyLLMConfiguration {
            chatModel
            chatModelMaxTokens
            fastChatModel
            fastChatModelMaxTokens
            completionModel
            completionModelMaxTokens
        }
    }
}`

export const REPOSITORY_ID_QUERY = `
query Repository($name: String!) {
	repository(name: $name) {
		id
	}
}`

export const REPOSITORY_EMBEDDING_EXISTS_QUERY = `
query Repository($name: String!) {
	repository(name: $name) {
                id
                embeddingExists
	}
}`

export const SEARCH_EMBEDDINGS_QUERY = `
query EmbeddingsSearch($repos: [ID!]!, $query: String!, $codeResultsCount: Int!, $textResultsCount: Int!) {
	embeddingsMultiSearch(repos: $repos, query: $query, codeResultsCount: $codeResultsCount, textResultsCount: $textResultsCount) {
		codeResults {
                        repoName
                        revision
			fileName
			startLine
			endLine
			content
		}
		textResults {
                        repoName
                        revision
			fileName
			startLine
			endLine
			content
		}
	}
}`

export const LEGACY_SEARCH_EMBEDDINGS_QUERY = `
query LegacyEmbeddingsSearch($repo: ID!, $query: String!, $codeResultsCount: Int!, $textResultsCount: Int!) {
	embeddingsSearch(repo: $repo, query: $query, codeResultsCount: $codeResultsCount, textResultsCount: $textResultsCount) {
		codeResults {
			fileName
			startLine
			endLine
			content
		}
		textResults {
			fileName
			startLine
			endLine
			content
		}
	}
}`

export const SEARCH_ATTRIBUTION_QUERY = `
query SnippetAttribution($snippet: String!) {
    snippetAttribution(snippet: $snippet) {
        limitHit
        nodes {
            repositoryName
        }
    }
}`

export const IS_CONTEXT_REQUIRED_QUERY = `
query IsContextRequiredForChatQuery($query: String!) {
	isContextRequiredForChatQuery(query: $query)
}`

/**
 * Deprecated following new event structure: https://github.com/sourcegraph/sourcegraph/pull/55126.
 */
export const LOG_EVENT_MUTATION_DEPRECATED = `
mutation LogEventMutation($event: String!, $userCookieID: String!, $url: String!, $source: EventSource!, $argument: String, $publicArgument: String) {
    logEvent(
		event: $event
		userCookieID: $userCookieID
		url: $url
		source: $source
		argument: $argument
		publicArgument: $publicArgument
    ) {
		alwaysNil
	}
}`

export const LOG_EVENT_MUTATION = `
mutation LogEventMutation($event: String!, $userCookieID: String!, $url: String!, $source: EventSource!, $argument: String, $publicArgument: String, $client: String, $connectedSiteID: String, $hashedLicenseKey: String) {
    logEvent(
		event: $event
		userCookieID: $userCookieID
		url: $url
		source: $source
		argument: $argument
		publicArgument: $publicArgument
		client: $client
		connectedSiteID: $connectedSiteID
		hashedLicenseKey: $hashedLicenseKey
    ) {
		alwaysNil
	}
}`

export const RECORD_TELEMETRY_EVENTS_MUTATION = `
mutation RecordTelemetryEvents($events: [TelemetryEventInput!]!) {
	telemetry {
		recordEvents(events: $events) {
			alwaysNil
		}
	}
}
`

export const CURRENT_SITE_IDENTIFICATION = `
query SiteIdentification {
	site {
		siteID
		productSubscription {
			license {
				hashedKey
			}
		}
	}
}`

export const GET_FEATURE_FLAGS_QUERY = `
    query FeatureFlags {
        evaluatedFeatureFlags() {
            name
            value
          }
    }
`

export const EVALUATE_FEATURE_FLAG_QUERY = `
    query EvaluateFeatureFlag($flagName: String!) {
        evaluateFeatureFlag(flagName: $flagName)
    }
`
