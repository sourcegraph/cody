import { URI } from 'vscode-uri'
import {
    type ContextItemPackage,
    ContextItemSource,
    type ContextItemWithContent,
} from '../../codebase-context/messages'
import type { PromptString } from '../../prompt/prompt-string'
import { graphqlClient } from '../../sourcegraph-api/graphql'
import { isError } from '../../utils'
import type { ContextItemFromProvider, ContextMentionProvider } from '../api'

export const GITHUB_CONTEXT_MENTION_PROVIDER: ContextMentionProvider<'github'> = {
    id: 'github',
    triggerPrefixes: ['github:', 'gh:'],

    async queryContextItems(query, signal) {
        const issueOrPullRequestNumber = Number(query.split(':')[1])
        if (!issueOrPullRequestNumber) {
            return []
        }

        try {
            const dataOrError = await graphqlClient.getPackageList(
                toPackageKind(ecosystem),
                name,
                MAX_PAKCAGE_LIST_CANDIDATES
            )

            if (signal) {
                signal.throwIfAborted()
            }

            if (isError(dataOrError)) {
                return []
            }

            const packages = dataOrError.packageRepoReferences.nodes

            return packages
                .map(node =>
                    node.repository
                        ? ({
                              type: 'package',
                              uri: URI.parse(`${graphqlClient.endpoint}${node.repository.name}`),
                              title: node.name,
                              content: undefined,
                              source: ContextItemSource.Package,
                              repoID: node.repository.id,
                              provider: 'github',
                              name: node.name,
                              ecosystem,
                          } as ContextItemPackage)
                        : null
                )
                .filter(item => item !== null) as ContextItemFromProvider<'package'>[]
        } catch (error) {
            return []
        }
    },

    async resolveContextItem(item, query, signal) {
        if (item.content !== undefined) {
            return [item as ContextItemWithContent]
        }

        if (item.type !== ContextItemSource.Package) {
            return []
        }

        return findContextItemsWithContentForPackage(item as ContextItemPackage, query)
    },
}

export async function findContextItemsWithContentForPackage(
    packageContextItem: ContextItemPackage,
    query: PromptString
): Promise<ContextItemWithContent[]> {
    // Sending prompt strings to the Sourcegraph search backend is fine.
    const result = await graphqlClient.contextSearch(
        new Set([packageContextItem.repoID]),
        query.toString()
    )
    if (isError(result) || result === null) {
        return []
    }

    return result.map(node => ({
        type: 'file',
        uri: node.uri,
        title: node.path,
        repoName: node.repoName,
        content: node.content,
        range: {
            start: { line: node.startLine, character: 0 },
            end: { line: node.endLine, character: 0 },
        },
        source: ContextItemSource.Package,
    }))
}
