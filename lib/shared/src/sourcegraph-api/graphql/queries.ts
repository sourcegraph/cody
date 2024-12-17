export const CURRENT_USER_ID_QUERY = `
query CurrentUser {
    currentUser {
        id
    }
}`

export const CURRENT_USER_ROLE_QUERY = `
query CurrentUserRole {
    currentUser {
        id
        siteAdmin
    }
}`

export const CURRENT_USER_CODY_PRO_ENABLED_QUERY = `
query CurrentUserCodyProEnabled {
    currentUser {
        codyProEnabled
    }
}`

export const CURRENT_USER_CODY_SUBSCRIPTION_QUERY = `
query CurrentUserCodySubscription {
    currentUser {
        codySubscription {
            status
            plan
            applyProRateLimits
            currentPeriodStartAt
            currentPeriodEndAt
        }
    }
}`

export const DELETE_ACCESS_TOKEN_MUTATION = `
mutation DeleteAccessToken($token: String!) {
    deleteAccessToken(byToken: $token) {
        alwaysNil
    }
}
`

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
        organizations {
            nodes {
                id
                name
            }
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
query CurrentSiteCodyLlmProvider {
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

export const CURRENT_SITE_CODY_LLM_CONFIGURATION_SMART_CONTEXT = `
query CurrentSiteCodyLlmConfiguration {
    site {
        codyLLMConfiguration {
            smartContextWindow
        }
    }
}`

export const REPOSITORY_LIST_QUERY = `
query Repositories($first: Int!, $after: String) {
    repositories(first: $first, after: $after) {
        nodes {
            id
            name
        }
        pageInfo {
            endCursor
        }
    }
}
`

export const REPOS_SUGGESTIONS_QUERY = `
    query SuggestionsRepo($query: String!) {
        search(patternType: regexp, query: $query) {
            results {
                repositories {
                    id
                    name
                    stars
                    url
                }
            }
        }
    }
`

export const FILE_CONTENTS_QUERY = `
query FileContentsQuery($repoName: String!, $filePath: String!, $rev: String!) {
    repository(name: $repoName){
        commit(rev: $rev) {
            file(path: $filePath) {
                path
                url
                content
            }
        }
    }
}`

export const FILE_MATCH_SEARCH_QUERY = `
query FileMatchSearchQuery($query: String!) {
  search(query: $query, version: V3, patternType: literal) {
    results {
      results {
        __typename
        ... on FileMatch {
          repository {
            id
            name
          }
          file {
            url
            path
            commit {
                oid
            }
          }
        }
      }
    }
  }
}`

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

export const LEGACY_CHAT_INTENT_QUERY = `
query ChatIntent($query: String!, $interactionId: String!) {
    chatIntent(query: $query, interactionId: $interactionId) {
        intent
        score
    }
}`

export const CHAT_INTENT_QUERY = `
query ChatIntent($query: String!, $interactionId: String!) {
    chatIntent(query: $query, interactionId: $interactionId) {
        intent
        score
        allScores {
            intent
            score
        }
    }
}`

export const LEGACY_CONTEXT_SEARCH_QUERY = `
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

export const CONTEXT_SEARCH_QUERY = `
query GetCodyContext($repos: [ID!]!, $query: String!, $codeResultsCount: Int!, $textResultsCount: Int!, $filePatterns: [String!]) {
	getCodyContext(repos: $repos, query: $query, codeResultsCount: $codeResultsCount, textResultsCount: $textResultsCount, filePatterns: $filePatterns) {
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

export const CONTEXT_SEARCH_QUERY_WITH_RANGES = `
query GetCodyContext($repos: [ID!]!, $query: String!, $codeResultsCount: Int!, $textResultsCount: Int!, $filePatterns: [String!]) {
	getCodyContext(repos: $repos, query: $query, codeResultsCount: $codeResultsCount, textResultsCount: $textResultsCount, filePatterns: $filePatterns) {
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
              matchedRanges {
                start {
                  line
                  column: character
                }
                end {
                  line
                  column: character
                }
              }
        }
    }
}`

export const CONTEXT_SEARCH_EVAL_DEBUG_QUERY = `
query GetCodyContextAlternatives($repos: [ID!]!, $query: String!, $codeResultsCount: Int!, $textResultsCount: Int!, $filePatterns: [String!]) {
	getCodyContextAlternatives(repos: $repos, query: $query, codeResultsCount: $codeResultsCount, textResultsCount: $textResultsCount, filePatterns: $filePatterns) {
      contextLists {
          name
          contextItems {
            ... on FileChunkContext {
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
        }
    }
}`

export const CONTEXT_FILTERS_QUERY = `
query ContextFilters {
    site {
        codyContextFilters(version: V1) {
            raw
        }
    }
}`

// Legacy prompts query supported up to Sourcegraph 5.8.0. Newer versions include the `includeViewerDrafts` argument.
export const LEGACY_PROMPTS_QUERY_5_8 = `
query ViewerPrompts($query: String!) {
    prompts(query: $query, first: 100, includeDrafts: false, viewerIsAffiliated: true, orderBy: PROMPT_UPDATED_AT) {
        nodes {
            id
            name
            nameWithOwner
            owner {
                namespaceName
            }
            description
            draft
            definition {
                text
            }
            url
            createdBy {
                id
                username
                displayName
                avatarURL
            }
        }
        totalCount
        pageInfo {
            hasNextPage
            endCursor
        }
    }
}`

export enum PromptsOrderBy {
    PROMPT_NAME_WITH_OWNER = 'PROMPT_NAME_WITH_OWNER',
    PROMPT_UPDATED_AT = 'PROMPT_UPDATED_AT',
    PROMPT_RECOMMENDED = 'PROMPT_RECOMMENDED',
}

export const PROMPTS_QUERY = `
query ViewerPrompts($query: String, $first: Int!, $recommendedOnly: Boolean!, $orderByMultiple: [PromptsOrderBy!], $tags: [ID!], $owner: ID, $includeViewerDrafts: Boolean!) {
    prompts(query: $query, first: $first, includeDrafts: false, recommendedOnly: $recommendedOnly, includeViewerDrafts: $includeViewerDrafts, viewerIsAffiliated: true, orderByMultiple: $orderByMultiple, tags: $tags, owner: $owner) {
        nodes {
            id
            name
            nameWithOwner
            recommended
            owner {
                namespaceName
            }
            description
            draft
            autoSubmit
            mode
            definition {
                text
            }
            url
            createdBy {
                id
                username
                displayName
                avatarURL
            }
            tags(first: 999) {
                nodes {
                    id
                    name
                }
            }
        }
        totalCount
    }
}`

export const BUILTIN_PROMPTS_QUERY = `
query ViewerBuiltinPrompts($query: String!, $first: Int!, $orderByMultiple: [PromptsOrderBy!]) {
    prompts(query: $query, first: $first, includeDrafts: false, recommendedOnly: false, builtinOnly: true, includeViewerDrafts: true, viewerIsAffiliated: true, orderByMultiple: $orderByMultiple) {
        nodes {
            id
            name
            nameWithOwner
            recommended
            owner {
                namespaceName
            }
            description
            draft
            autoSubmit
            mode
            definition {
                text
            }
            url
            createdBy {
                id
                username
                displayName
                avatarURL
            }
        }
        totalCount
    }
}`

export const PROMPT_TAGS_QUERY = `
query PromptTags() {
    promptTags(first: 999) {
        nodes {
            id
            name
        }
    }
}`

export const REPO_NAME_QUERY = `
query ResolveRepoName($cloneURL: String!) {
    repository(cloneURL: $cloneURL) {
        name
    }
}
`

export const SEARCH_ATTRIBUTION_QUERY = `
query SnippetAttribution($snippet: String!) {
    snippetAttribution(snippet: $snippet) {
        limitHit
        nodes {
            repositoryName
        }
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

export const CREATE_PROMPT_MUTATION = `
mutation CreatePrompt($input: PromptInput!) {
    createPrompt(input: $input) {
        id
    }
}
`

export const CHANGE_PROMPT_VISIBILITY = `
mutation ChangePromptVisibility($id: ID!, $newVisibility: PromptVisibility!) {
    changePromptVisibility(id: $id, newVisibility: $newVisibility) {
        id
    }
}
`

export const GET_FEATURE_FLAGS_QUERY = `
    query FeatureFlags {
        evaluatedFeatureFlags {
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

export const PACKAGE_LIST_QUERY = `
    query Packages($kind: PackageRepoReferenceKind!, $name: String!, $first: Int!, $after: String) {
        packageRepoReferences(kind: $kind, name: $name, first: $first, after: $after) {
            nodes {
                id
                name
                kind
                repository {
                    id
                    name
                    url
                }
            }
            pageInfo {
                endCursor
            }
        }
    }
`

export const FUZZY_FILES_QUERY = `
query FuzzyFiles($query: String!) {
    search(patternType: regexp, query: $query) {
        results {
            results {
                ... on FileMatch {
                    __typename
                    file {
                        url
                        path
                        name
                        byteSize
                        isDirectory
                    }
                    repository {
                        id
                        name
                    }
                }
            }
        }
    }
}
`

export const FUZZY_SYMBOLS_QUERY = `
query FuzzySymbols($query: String!) {
    search(patternType: regexp, query: $query) {
        results {
            results {
                ... on FileMatch {
                    __typename
                    symbols {
                        name
                        location {
                            range {
                                start { line }
                                end { line }
                            }
                             resource {
                                path
                             }
                        }
                    }
                    repository {
                        id
                        name
                    }
                }
            }
        }
    }
}
`

export const GET_REMOTE_FILE_QUERY = `
query GetRemoteFileQuery($repositoryName: String!, $filePath: String!, $startLine: Int, $endLine: Int) {
  repository(name: $repositoryName) {
    id
    commit(rev: "HEAD") {
      id
      oid
      blob(path: $filePath) {
         content(startLine:$startLine endLine:$endLine)
      }
    }
  }
}
`

export const GET_URL_CONTENT_QUERY = `
query GetURLContentQuery($url: String!) {
    urlMentionContext(url: $url) {
        title
        content
    }
}
`

export const VIEWER_SETTINGS_QUERY = `
query ViewerSettings {
  viewerSettings {
    final
  }
}
`

export const HIGHLIGHTED_FILE_QUERY = `
   query HighlightedFile(
        $repoName: String!
        $commitID: String!
        $filePath: String!
        $disableTimeout: Boolean!
        $ranges: [HighlightLineRange!]!
        $format: HighlightResponseFormat!
    ) {
        repository(name: $repoName) {
            commit(rev: $commitID) {
                file(path: $filePath) {
                    isDirectory
                    richHTML
                    highlight(disableTimeout: $disableTimeout, format: $format) {
                        aborted
                        lineRanges(ranges: $ranges)
                    }
                }
            }
        }
    }
`

export const NLS_SEARCH_QUERY = `
    query NLSSearchQuery($query: String!) {
        search(query: $query, version: V3, patternType: nls) {
            results {
                dynamicFilters {
                    value
                    label
                    count
                    kind
                }
                results {
                    __typename
                    ... on FileMatch {
                        repository {
                            id
                            name
                        }
                        file {
                            url
                            path
                            commit {
                                oid
                            }
                        }
                        chunkMatches {
                            content
                            contentStart {
                                line
                                character
                            }
                            ranges {
                                start {
                                    line
                                    character
                                }
                                end {
                                    line
                                    character
                                }
                            }
                        }
                        pathMatches {
                            start {
                                line
                                character
                            }
                            end {
                                line
                                character
                            }
                        }
                        symbols {
                            name
                            location {
                                range {
                                    start {
                                        line
                                        character
                                    }
                                    end {

                                        line
                                        character
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }`
