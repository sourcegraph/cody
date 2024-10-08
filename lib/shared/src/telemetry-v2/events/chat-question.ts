import type { Span } from '@opentelemetry/api'
import { cloneDeep, isArray } from 'lodash'
import type { AuthStatus } from '../../auth/types'
import type { ChatMessage, EventSource } from '../../chat/transcript/messages'
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
import { isDotCom, isS2 } from '../../sourcegraph-api/environments'
import { CHAT_INPUT_TOKEN_BUDGET } from '../../token/constants'
import type { TokenCounterUtils } from '../../token/counter'
import { telemetryRecorder } from '../singleton'
import { event, fallbackValue, pickDefined } from './internal'

export interface SharedProperties {
    requestID: string
    promptText: PromptString
    authStatus: AuthStatus
    chatModel: string
    source?: EventSource | undefined
    command?: DefaultChatCommands | undefined
    traceId: string
    sessionID: string
    repoIsPublic: boolean
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
                    isDotCom(params.authStatus) && params.repoIsPublic && isArray(params.repoMetadata)
                        ? params.repoMetadata
                        : undefined

                telemetryRecorder.recordEvent(feature, action, {
                    metadata: {
                        // Flag indicating this is a transcript event to go through ML data pipeline. Only for DotCom users
                        // See https://github.com/sourcegraph/sourcegraph/pull/59524
                        recordsPrivateMetadataTranscript: recordTranscript ? 1 : 0,
                        isPublicRepo: params.repoIsPublic ? 1 : 0,
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
        {
            // Mappers
        }
    ),
    event(
        'cody.chat-question/executed',
        ({ feature, action, map }) =>
            (
                params: {
                    promptText: PromptString
                    authStatus: AuthStatus
                    context: ContextItem[] | { used: ContextItem[]; ignored: ContextItem[] }
                    repoIsPublic: boolean
                    repoMetadata?: { commit?: string; remoteID?: string }[]
                    detectedIntent: ChatMessage['intent']
                    detectedIntentScores:
                        | {
                              intent: string
                              score: number
                          }[]
                        | null
                        | undefined
                    userSpecifiedIntent: ChatMessage['intent'] | 'auto'
                } & SharedProperties,
                spans: {
                    current: Span
                    firstToken: Span
                    addMetadata: boolean
                },
                tokenCounterUtils: TokenCounterUtils
            ) => {
                const recordTranscript =
                    params.authStatus.endpoint &&
                    (isDotCom(params.authStatus) || isS2(params.authStatus))

                const gitMetadata =
                    recordTranscript && params.repoIsPublic && isArray(params.repoMetadata)
                        ? params.repoMetadata
                        : undefined

                const metadata = isArray(params.context)
                    ? publicContextSummary('context', params.context)
                    : {
                          ...publicContextSummary('context.used', params.context.used),
                          ...publicContextSummary('context.ignored', params.context.ignored),
                      }
                if (spans.addMetadata) {
                    spans.current.setAttributes(metadata)
                    spans.firstToken.setAttributes(metadata)
                }

                const telemetryData = {
                    metadata: pickDefined({
                        userSpecifiedIntent: params.userSpecifiedIntent
                            ? map.intent(params.userSpecifiedIntent)
                            : undefined,
                        detectedIntent: params.detectedIntent
                            ? map.intent(params.detectedIntent)
                            : undefined,
                        ...metadata,
                        recordsPrivateMetadataTranscript: recordTranscript ? 1 : 0,
                    }),
                    privateMetadata: {
                        detectedIntentScores: params.detectedIntentScores?.length
                            ? params.detectedIntentScores.reduce(
                                  (scores, value) => {
                                      scores[value.intent] = value.score
                                      return scores
                                  },
                                  {} as Record<string, number>
                              )
                            : undefined,
                        detectedIntent: params.detectedIntent,
                        userSpecifiedIntent: params.userSpecifiedIntent,
                        traceId: spans.current.spanContext().traceId,
                        gitMetadata,
                        // 🚨 SECURITY: Chat transcripts are to be included only for S2 & Dotcom users AND for V2 telemetry.
                        // V2 telemetry exports privateMetadata only for S2 & Dotcom users. The condition below is an additional safeguard measure.
                        // Check `SRC_TELEMETRY_SENSITIVEMETADATA_ADDITIONAL_ALLOWED_EVENT_TYPES` env to learn more.
                        promptText: recordTranscript
                            ? truncatePromptString(
                                  params.promptText,
                                  CHAT_INPUT_TOKEN_BUDGET,
                                  tokenCounterUtils
                              )
                            : undefined,
                    },
                    billingMetadata: {
                        product: 'cody',
                        category: 'billable',
                    },
                } as const
                telemetryRecorder.recordEvent(feature, action, telemetryData)
            },
        {
            intent: {
                [fallbackValue]: 0,
                auto: 1,
                chat: 2,
                search: 3,
            } satisfies Record<
                typeof fallbackValue | 'auto' | Exclude<ChatMessage['intent'], null | undefined>,
                number
            >,
        }
    ),
    // //TODO
    // event(
    //     'cody.chat-question/response',
    //     ({ feature, action }) =>
    //         () => {},
    //     {}
    // ),
]

function publicContextSummary(globalPrefix: string, context: ContextItem[]) {
    const global = cloneDeep(defaultSharedItemCount)
    const bySource = {
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
        tree: {
            ...cloneDeep(defaultByTypeCount),
            isWorkspaceRoot: undefined as number | undefined,
        },
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
    types: {
        [key in Exclude<ContextItem['type'], undefined>]: number | undefined
    }
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
    sources: {
        [key in Exclude<ContextItem['source'] | 'other', undefined>]: number | undefined
    }
}
const defaultByTypeCount: ByTypeCount = {
    ...defaultSharedItemCount,
    sources: {
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
