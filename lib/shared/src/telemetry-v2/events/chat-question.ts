import type { Span } from '@opentelemetry/api'
import { cloneDeep, isArray } from 'lodash'
import type { AuthStatus } from '../../auth/types'
import type { EventSource } from '../../chat/transcript/messages'
import { type ContextItem, ContextItemSource } from '../../codebase-context/messages'
import type { DefaultChatCommands } from '../../commands/types'
import {
    GIT_OPENCTX_PROVIDER_URI,
    REMOTE_DIRECTORY_PROVIDER_URI,
    REMOTE_FILE_PROVIDER_URI,
    REMOTE_REPOSITORY_PROVIDER_URI,
    WEB_PROVIDER_URI,
} from '../../context/openctx/api'
import type { PromptString } from '../../prompt/prompt-string'
import { truncatePromptString } from '../../prompt/truncation'
import { isDotCom } from '../../sourcegraph-api/environments'
import { CHAT_INPUT_TOKEN_BUDGET } from '../../token/constants'
import type { TokenCounterUtils } from '../../token/counter'
import { telemetryRecorder } from '../singleton'
import { event, pickDefined } from './internal'
export interface SharedProperties {
    requestID: string
    promptText: PromptString
    authStatus: AuthStatus
    chatModel: string
    source?: EventSource | undefined
    command?: DefaultChatCommands | undefined
    traceId: string
    sessionID: string
    addEnhancedContext: boolean
    isPublicRepo: boolean
    repoMetadata?: { commit?: string; remoteID?: string }[]
}
export const events = [
    event(
        'cody.chat-question/submitted',
        ({ feature, action }) =>
            (
                params: {
                    mentions: ContextItem[]
                } & SharedProperties,
                tokenCounterUtils: TokenCounterUtils
            ) => {
                const recordTranscript = params.authStatus.endpoint && isDotCom(params.authStatus)

                const gitMetadata =
                    isDotCom(params.authStatus) && params.isPublicRepo && isArray(params.repoMetadata)
                        ? JSON.stringify(params.repoMetadata)
                        : undefined

                telemetryRecorder.recordEvent(feature, action, {
                    metadata: {
                        // Flag indicating this is a transcript event to go through ML data pipeline. Only for DotCom users
                        // See https://github.com/sourcegraph/sourcegraph/pull/59524
                        recordsPrivateMetadataTranscript: recordTranscript ? 1 : 0,
                        addEnhancedContext: params.addEnhancedContext ? 1 : 0,
                        isPublicRepo: params.isPublicRepo ? 1 : 0,
                        ...publicMentionSummary(params.mentions),
                        ...publicContextSummary('mentions', params.mentions),
                    },
                    privateMetadata: {
                        chatModel: params.chatModel,
                        command: params.command,
                        requestID: params.requestID,
                        sessionID: params.sessionID,
                        traceId: params.traceId,
                        // 🚨 SECURITY: chat transcripts are to be included only for DotCom users AND for V2 telemetry
                        // V2 telemetry exports privateMetadata only for DotCom users
                        // the condition below is an additional safeguard measure
                        promptText: recordTranscript
                            ? truncatePromptString(
                                  params.promptText,
                                  CHAT_INPUT_TOKEN_BUDGET,
                                  tokenCounterUtils
                              )
                            : undefined,
                        gitMetadata,
                    },
                    billingMetadata: {
                        product: 'cody',
                        category: 'billable',
                    },
                })
            },
        {}
    ),
    event(
        'cody.chat-question/executed',
        ({ feature, action }) =>
            (
                params: {
                    promptText: PromptString
                    authStatus: AuthStatus
                    context: { used: ContextItem[]; ignored: ContextItem[] }
                    isPublicRepo: boolean
                    repoMetadata?: { commit?: string; remoteID?: string }[]
                } & SharedProperties,
                spans: {
                    current: Span
                    firstToken: Span
                    addMetadata: boolean
                }
            ) => {
                //TODO: The submitted one stringifies this for some reason?
                const gitMetadata =
                    isDotCom(params.authStatus) && params.isPublicRepo && isArray(params.repoMetadata)
                        ? params.repoMetadata
                        : undefined

                const metadata = {
                    ...publicContextSummary('context.used', params.context.used),
                    ...publicContextSummary('context.ignored', params.context.ignored),
                }
                if (spans.addMetadata) {
                    spans.current.setAttributes(metadata)
                    spans.firstToken.setAttributes(metadata)
                }

                telemetryRecorder.recordEvent(feature, action, {
                    metadata: {
                        ...metadata,
                    },
                    privateMetadata: {
                        traceId: spans.current.spanContext().traceId,
                        gitMetadata,
                    },
                    billingMetadata: {
                        product: 'cody',
                        category: 'billable',
                    },
                })
            },
        {}
    ),
    //TODO: Why are these separate events?
    event(
        'cody.chat-question/response',
        ({ feature, action }) =>
            () => {},
        {}
    ),
]

// private async sendChatExecutedTelemetry(
//     span: Span,
//     firstTokenSpan: Span,
//     inputText: PromptString,
//     sharedProperties: any,
//     context: PromptInfo['context']
// ): Promise<void> {
//     const authStatus = currentAuthStatus()

//     // Create a summary of how many code snippets of each context source are being
//     // included in the prompt
//     const contextSummary: { [key: string]: number } = {}
//     for (const { source } of context.used) {
//         if (!source) {
//             continue
//         }
//         if (contextSummary[source]) {
//             contextSummary[source] += 1
//         } else {
//             contextSummary[source] = 1
//         }
//     }
//     const privateContextSummary = await this.buildPrivateContextSummary(context)

//     const properties = {
//         ...sharedProperties,
//         traceId: span.spanContext().traceId,
//     }
//     span.setAttributes(properties)
//     firstTokenSpan.setAttributes(properties)

//     telemetryRecorder.recordEvent('cody.chat-question', 'executed', {
//         metadata: {
//             ...contextSummary,
//             // Flag indicating this is a transcript event to go through ML data pipeline. Only for DotCom users
//             // See https://github.com/sourcegraph/sourcegraph/pull/59524
//             recordsPrivateMetadataTranscript: isDotCom(authStatus) ? 1 : 0,
//         },
//         privateMetadata: {
//             properties,
//             privateContextSummary: privateContextSummary,
//             // 🚨 SECURITY: chat transcripts are to be included only for DotCom users AND for V2 telemetry
//             // V2 telemetry exports privateMetadata only for DotCom users
//             // the condition below is an additional safeguard measure
//             promptText:
//                 isDotCom(authStatus) &&
//                 (await truncatePromptString(inputText, CHAT_INPUT_TOKEN_BUDGET)),
//         },
//         billingMetadata: {
//             product: 'cody',
//             category: 'core',
//         },
//     })
// }

// TODO: Remove this once no other systems depend on these telemetry events anymore
function publicMentionSummary(context: ContextItem[]) {
    const intitialContext = context.filter(item => item.source !== ContextItemSource.User)
    const userContext = context.filter(item => item.source === ContextItemSource.User)

    return {
        // All mentions
        mentionsTotal: context.length,
        mentionsOfRepository: context.filter(item => item.type === 'repository').length,
        mentionsOfTree: context.filter(item => item.type === 'tree').length,
        mentionsOfWorkspaceRootTree: context.filter(item => item.type === 'tree' && item.isWorkspaceRoot)
            .length,
        mentionsOfFile: context.filter(item => item.type === 'file').length,

        // Initial context mentions
        mentionsInInitialContext: intitialContext.length,
        mentionsInInitialContextOfRepository: intitialContext.filter(item => item.type === 'repository')
            .length,
        mentionsInInitialContextOfTree: intitialContext.filter(item => item.type === 'tree').length,
        mentionsInInitialContextOfWorkspaceRootTree: intitialContext.filter(
            item => item.type === 'tree' && item.isWorkspaceRoot
        ).length,
        mentionsInInitialContextOfFile: intitialContext.filter(item => item.type === 'file').length,

        // Explicit mentions by user
        mentionsByUser: userContext.length,
        mentionsByUserOfRepository: userContext.filter(item => item.type === 'repository').length,
        mentionsByUserOfTree: userContext.filter(item => item.type === 'tree').length,
        mentionsByUserOfWorkspaceRootTree: userContext.filter(
            item => item.type === 'tree' && item.isWorkspaceRoot
        ).length,
        mentionsByUserOfFile: userContext.filter(item => item.type === 'file').length,
    }
}

function publicContextSummary(globalPrefix: string, context: ContextItem[]) {
    const global = cloneDeep(defaultSharedItemCount)
    const bySource = {
        [ContextItemSource.Embeddings]: cloneDeep(defaultBySourceCount),
        [ContextItemSource.User]: cloneDeep(defaultBySourceCount),
        [ContextItemSource.Editor]: cloneDeep(defaultBySourceCount),
        [ContextItemSource.Search]: cloneDeep(defaultBySourceCount),
        [ContextItemSource.Initial]: cloneDeep(defaultBySourceCount),
        [ContextItemSource.Unified]: cloneDeep(defaultBySourceCount),
        [ContextItemSource.Selection]: cloneDeep(defaultBySourceCount),
        [ContextItemSource.Terminal]: cloneDeep(defaultBySourceCount),
        [ContextItemSource.History]: cloneDeep(defaultBySourceCount),
        other: cloneDeep(defaultBySourceCount),
    }
    const byType = {
        file: cloneDeep(defaultByTypeCount),
        openctx: cloneDeep(defaultByTypeCount),
        repository: cloneDeep(defaultByTypeCount),
        symbol: cloneDeep(defaultByTypeCount),
        tree: { ...cloneDeep(defaultByTypeCount), isWorkspaceRoot: undefined as number | undefined },
    }
    const byOpenctxProvider = {
        [REMOTE_REPOSITORY_PROVIDER_URI]: cloneDeep(defaultSharedItemCount),
        [REMOTE_FILE_PROVIDER_URI]: cloneDeep(defaultSharedItemCount),
        [REMOTE_DIRECTORY_PROVIDER_URI]: cloneDeep(defaultSharedItemCount),
        [WEB_PROVIDER_URI]: cloneDeep(defaultSharedItemCount),
        [GIT_OPENCTX_PROVIDER_URI]: cloneDeep(defaultSharedItemCount),
        other: cloneDeep(defaultSharedItemCount),
    }

    const incrementShared = (target: SharedItemCount, item: ContextItem) => {
        target.total = (target.total ?? 0) + 1
        target.URIs.add(item.uri.toString())
        target.hasRange = (target.hasRange ?? 0) + (item.range ? 1 : 0)
        target.isTooLarge = (target.isTooLarge ?? 0) + (item.isTooLarge ? 1 : 0)
        target.isIgnored = (target.isIgnored ?? 0) + (item.isIgnored ? 1 : 0)
        if (item.size !== undefined) {
            //TODO: Always calculate size
            target.sizes.push(item.size)
        }
    }
    for (const item of context) {
        incrementShared(global, item)
        //bySource countbuildPrivateContextSummary
        const source = bySource[item.source ?? 'other']
        incrementShared(source, item)
        source.types[item.type] = (source.types[item.type] ?? 0) + 1
        if (item.type === 'tree') {
            source.isWorkspaceRoot = (source.isWorkspaceRoot ?? 0) + (item.isWorkspaceRoot ? 1 : 0)
        }

        //byType count
        const type = byType[item.type]
        incrementShared(type, item)
        type.sources[item.source ?? 'other'] = (type.sources[item.source ?? 'other'] ?? 0) + 1
        if (item.type === 'tree') {
            byType.tree.isWorkspaceRoot =
                (byType.tree.isWorkspaceRoot ?? 0) + (item.isWorkspaceRoot ? 1 : 0)
        }

        // openctx provider count
        if (item.type === 'openctx') {
            const provider =
                item.providerUri in byOpenctxProvider
                    ? byOpenctxProvider[item.providerUri as keyof typeof byOpenctxProvider]
                    : byOpenctxProvider.other
            incrementShared(provider, item)
        }
    }

    //finalize
    const finalizeShared = <Prefix extends string>(
        prefix: Prefix,
        { URIs, sizes, ...shared }: SharedItemCount
    ) => {
        const sortedSizes = sizes.sort((a, b) => a - b)

        return {
            [`${prefix}.total`]: shared.total,
            [`${prefix}.hasRange`]: shared.hasRange,
            [`${prefix}.isIgnored`]: shared.isIgnored,
            [`${prefix}.isTooLarge`]: shared.isTooLarge,
            [`${prefix}.URIs`]: URIs.size > 0 ? URIs.size : undefined,
            [`${prefix}.size.min`]: sortedSizes.length > 0 ? Math.min(...sizes) : undefined,
            [`${prefix}.size.max`]: sortedSizes.length > 0 ? Math.max(...sizes) : undefined,
            [`${prefix}.size.avg`]:
                sortedSizes.length > 0 ? sizes.reduce((a, b) => a + b, 0) / sizes.length : undefined,
            [`${prefix}.size.median`]:
                sortedSizes.length > 0 ? sortedSizes[Math.floor(sortedSizes.length / 2)] : undefined,
        } as const
    }

    // final summary
    const output: Record<string, number | undefined> = finalizeShared(globalPrefix, global)
    const bySourcePrefix = [globalPrefix, 'bySource'].filter(Boolean).join('.')
    for (const [k, v] of Object.entries(bySource)) {
        Object.assign(output, finalizeShared(bySourcePrefix, v))
        output[`${bySourcePrefix}.${k}.isWorkspaceRoot`] = v.isWorkspaceRoot
        for (const [typeKey, typeCount] of Object.entries(v.types)) {
            output[`${bySourcePrefix}.${k}.types.${typeKey}`] = typeCount
        }
    }

    const byTypePrefix = [globalPrefix, 'byType'].filter(Boolean).join('.')
    for (const [k, v] of Object.entries(byType)) {
        Object.assign(output, finalizeShared(`${byTypePrefix}.${k}`, v))
        for (const [sourceKey, sourceCount] of Object.entries(v.sources)) {
            output[`${byTypePrefix}.${k}.sources.${sourceKey}`] = sourceCount
        }
        if ('isWorkspaceRoot' in v) {
            output[`${byTypePrefix}.${k}.isWorkspaceRoot`] = v.isWorkspaceRoot
        }
    }

    const byOpenctxProviderPrefix = [globalPrefix, 'byOpenctxProvider'].filter(Boolean).join('.')
    for (const [k, v] of Object.entries(byOpenctxProvider)) {
        Object.assign(output, finalizeShared(`${byOpenctxProviderPrefix}.${k}`, v))
    }

    const definedOutput = pickDefined(output)

    return definedOutput
}

interface SharedItemCount {
    total: number | undefined
    URIs: Set<string>
    hasRange: number | undefined
    isIgnored: number | undefined
    isTooLarge: number | undefined
    sizes: number[]
}
const defaultSharedItemCount: SharedItemCount = {
    total: undefined,
    URIs: new Set(),
    hasRange: undefined,
    isIgnored: undefined,
    isTooLarge: undefined,
    sizes: [],
}
type BySourceCount = SharedItemCount & {
    isWorkspaceRoot: number | undefined
    types: { [key in NonUndefined<ContextItem['type']>]: number | undefined }
}
const defaultBySourceCount: BySourceCount = {
    ...defaultSharedItemCount,
    isWorkspaceRoot: undefined,
    types: {
        file: undefined,
        repository: undefined,
        tree: undefined,
        openctx: undefined,
        symbol: undefined,
    },
}

type ByTypeCount = SharedItemCount & {
    sources: { [key in NonUndefined<ContextItem['source'] | 'other'>]: number | undefined }
}
const defaultByTypeCount: ByTypeCount = {
    ...defaultSharedItemCount,
    sources: {
        [ContextItemSource.Embeddings]: undefined,
        [ContextItemSource.User]: undefined,
        [ContextItemSource.Editor]: undefined,
        [ContextItemSource.Search]: undefined,
        [ContextItemSource.Initial]: undefined,
        [ContextItemSource.Unified]: undefined,
        [ContextItemSource.Selection]: undefined,
        [ContextItemSource.Terminal]: undefined,
        [ContextItemSource.History]: undefined,
        other: undefined,
    },
}

////////////////////////////////////////

// private async recordChatQuestionTelemetryEvent(
//     authStatus: AuthStatus,
//     legacyAddEnhancedContext: boolean,
//     mentions: ContextItem[],
//     sharedProperties: any,
//     inputText: PromptString
// ): Promise<void> {
//     const mentionsInInitialContext = context.filter(item => item.source !== ContextItemSource.User)
//     const mentionsByUser = context.filter(item => item.source === ContextItemSource.User)

//     let gitMetadata = ''
//     if (workspaceReposMonitor) {
//         const { isPublic: isWorkspacePublic, repoMetadata } =
//             await workspaceReposMonitor.getRepoMetadataIfPublic()
//         if (isDotCom(authStatus) && legacyAddEnhancedContext && isWorkspacePublic) {
//             gitMetadata = JSON.stringify(repoMetadata)
//         }
//     }
//     telemetryRecorder.recordEvent('cody.chat-question', 'submitted', {
//         metadata: {
//             // Flag indicating this is a transcript event to go through ML data pipeline. Only for DotCom users
//             // See https://github.com/sourcegraph/sourcegraph/pull/59524
//             recordsPrivateMetadataTranscript: authStatus.endpoint && isDotCom(authStatus) ? 1 : 0,
//             addEnhancedContext: legacyAddEnhancedContext ? 1 : 0,

//             // All mentions
//             mentionsTotal: context.length,
//             mentionsOfRepository: context.filter(item => item.type === 'repository').length,
//             mentionsOfTree: context.filter(item => item.type === 'tree').length,
//             mentionsOfWorkspaceRootTree: context.filter(
//                 item => item.type === 'tree' && item.isWorkspaceRoot
//             ).length,
//             mentionsOfFile: context.filter(item => item.type === 'file').length,

//             // Initial context mentions
//             mentionsInInitialContext: mentionsInInitialContext.length,
//             mentionsInInitialContextOfRepository: mentionsInInitialContext.filter(
//                 item => item.type === 'repository'
//             ).length,
//             mentionsInInitialContextOfTree: mentionsInInitialContext.filter(
//                 item => item.type === 'tree'
//             ).length,
//             mentionsInInitialContextOfWorkspaceRootTree: mentionsInInitialContext.filter(
//                 item => item.type === 'tree' && item.isWorkspaceRoot
//             ).length,
//             mentionsInInitialContextOfFile: mentionsInInitialContext.filter(
//                 item => item.type === 'file'
//             ).length,

//             // Explicit mentions by user
//             mentionsByUser: mentionsByUser.length,
//             mentionsByUserOfRepository: mentionsByUser.filter(item => item.type === 'repository')
//                 .length,
//             mentionsByUserOfTree: mentionsByUser.filter(item => item.type === 'tree').length,
//             mentionsByUserOfWorkspaceRootTree: mentionsByUser.filter(
//                 item => item.type === 'tree' && item.isWorkspaceRoot
//             ).length,
//             mentionsByUserOfFile: mentionsByUser.filter(item => item.type === 'file').length,
//         },
//         privateMetadata: {
//             ...sharedProperties,
//             // 🚨 SECURITY: chat transcripts are to be included only for DotCom users AND for V2 telemetry
//             // V2 telemetry exports privateMetadata only for DotCom users
//             // the condition below is an additional safeguard measure
//             promptText:
//                 isDotCom(authStatus) &&
//                 (await truncatePromptString(inputText, CHAT_INPUT_TOKEN_BUDGET)),
//             gitMetadata,
//         },
//         billingMetadata: {
//             product: 'cody',
//             category: 'billable',
//         },
//     })
// }

/////

// private async buildPrivateContextSummary(context: {
//     used: ContextItem[]
//     ignored: ContextItem[]
// }): Promise<object> {
//     // 🚨 SECURITY: included only for dotcom users & public repos
//     if (!isDotCom(currentAuthStatus())) {
//         return {}
//     }
//     if (!workspaceReposMonitor) {
//         return {}
//     }

//     const { isPublic, repoMetadata: gitMetadata } =
//         await workspaceReposMonitor.getRepoMetadataIfPublic()
//     if (!isPublic) {
//         return {}
//     }

//     const getContextSummary = async (items: ContextItem[]) => ({
//         count: items.length,
//         items: await Promise.all(
//             items.map(async i => ({
//                 source: i.source,
//                 size: i.size || (await TokenCounterUtils.countTokens(i.content || '')),
//                 content: i.content,
//             }))
//         ),
//     })

//     return {
//         included: await getContextSummary(context.used),
//         excluded: await getContextSummary(context.ignored),
//         gitMetadata,
//     }
// }
type NonUndefined<T> = T extends undefined ? never : T
