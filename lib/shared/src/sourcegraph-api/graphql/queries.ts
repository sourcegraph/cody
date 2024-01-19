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

export const CURRENT_SITE_CODY_CONFIG_FEATURES = `
query CodyConfigFeaturesResponse {
    site {
        codyConfigFeatures {
            chat
            autoComplete
            commands
            attribution
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

export const REPOSITORY_LIST_QUERY = `
query Repositories($first: Int!, $after: String) {
    repositories(first: $first, after: $after) {
        nodes {
            id
            name
            url
        }
        pageInfo {
            endCursor
        }
    }
}
`

export const REPOSITORY_ID_QUERY = `
query Repository($name: String!) {
	repository(name: $name) {
		id
	}
}`

export const REPOSITORY_IDS_QUERY = `
query Repositories($names: [String!]!, $first: Int!) {
    repositories(names: $names, first: $first) {
      nodes {
        name
        id
      }
    }
  }
`

export const CONTEXT_SEARCH_QUERY = `
query GetCodyContext($repos: [ID!]!, $query: String!, $codeResultsCount: Int!, $textResultsCount: Int!) {
	getCodyContext(repos: $repos, query: $query, codeResultsCount: $codeResultsCount, textResultsCount: $textResultsCount) {
        ...on FileChunkContext {
            blob {
                path
                repository {
                  id
                  name
                }
                commit {
                  oid
                }
                url
              }
              startLine
              endLine
              chunkContent
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
