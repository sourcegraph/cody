import { ChatClient } from '../../chat/chat'
import { Configuration } from '../../configuration'
import { Message } from '../../sourcegraph-api/completions/types'

import { makePrompt } from './prompt'
import {
    Plugin,
    PluginChosenFunctionDescriptor,
    PluginFunctionExecutionInfo,
    PluginFunctionOutput,
    PluginFunctionWithParameters,
} from './types'

export const chooseDataSources = (
    humanChatInput: string,
    client: ChatClient,
    plugins: Plugin[],
    previousMessages: Message[] = []
): Promise<PluginFunctionWithParameters[]> => {
    const dataSources = plugins.flatMap(plugin => plugin.dataSources)

    const messages = makePrompt(
        humanChatInput,
        dataSources.map(({ descriptor }) => descriptor),
        previousMessages
    )
    return new Promise<PluginFunctionWithParameters[]>((resolve, reject) => {
        let lastResponse = ''
        client.chat(
            messages,
            {
                onChange: text => {
                    lastResponse = text
                },
                onComplete: () => {
                    try {
                        const chosenFunctions = JSON.parse(lastResponse.trim()) as PluginChosenFunctionDescriptor[]
                        const functionsWithParameters = chosenFunctions
                            .map(item => {
                                const dataSource = dataSources.find(ds => ds.descriptor.name === item.name)
                                const plugin = plugins.find(plugin =>
                                    plugin.dataSources.some(ds => ds.descriptor.name === item.name)
                                )
                                if (!plugin || !dataSource) {
                                    return undefined
                                }
                                return {
                                    ...dataSource,
                                    pluginName: plugin?.name,
                                    parameters: item.parameters,
                                }
                            })
                            .filter(Boolean)
                        resolve(functionsWithParameters as PluginFunctionWithParameters[])
                    } catch (error) {
                        reject(new Error(`Error parsing llm intent detection response: ${error}`))
                    }
                },
                onError: (error, statusCode) => {
                    reject(new Error(`error: ${error}\nstatus code: ${statusCode}`))
                },
            },
            {
                fast: true,
            }
        )
    })
}

export const runPluginFunctions = async (
    functionsWithParameters: PluginFunctionWithParameters[],
    config: Configuration['pluginsConfig']
): Promise<{ prompt: Message[]; executionInfos: PluginFunctionExecutionInfo[] }> => {
    const executionInfos = await Promise.all(
        functionsWithParameters.map(
            async ({ pluginName, descriptor, handler, parameters }): Promise<PluginFunctionExecutionInfo> => {
                const { output = [], error }: { output?: PluginFunctionOutput[]; error?: any } = await handler(
                    parameters,
                    { config }
                )
                    .then(output => ({ output }))
                    .catch(error => ({
                        error: `${error}`,
                    }))

                return {
                    pluginName,
                    name: descriptor.name,
                    parameters,
                    output,
                    error,
                }
            }
        )
    )

    const filtered = executionInfos.filter(executionInfo => !executionInfo.error)

    if (filtered.length > 0) {
        return {
            prompt: [
                {
                    speaker: 'human',
                    text:
                        'I have following responses from external API plugins that I called now:\n' +
                        filtered
                            .map(
                                executionInfo =>
                                    `from "${executionInfo.pluginName}":\n\`\`\`json\n${JSON.stringify(
                                        executionInfo.output
                                    )}`
                            )
                            .join('\n'),
                },
                {
                    speaker: 'assistant',
                    text: 'Understood, I have additional knowledge when answering your question.',
                },
            ],
            executionInfos,
        }
    }

    return { prompt: [], executionInfos }
}
