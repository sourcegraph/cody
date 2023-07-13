import { ChatClient } from '../../chat/chat'
import { Configuration } from '../../configuration'
import { Message } from '../../sourcegraph-api/completions/types'

import { makePrompt } from './prompt'
import {
    IPlugin,
    IPluginContext,
    IPluginFunctionCallDescriptor,
    IPluginFunctionChosenDescriptor,
    IPluginFunctionOutput,
} from './types'

export const chooseDataSources = (
    humanChatInput: string,
    client: ChatClient,
    plugins: IPlugin[],
    previousMessages: Message[] = []
): Promise<IPluginFunctionCallDescriptor[]> => {
    const allDataSources = plugins.flatMap(plugin => plugin.dataSources)

    const messages = makePrompt(
        humanChatInput,
        allDataSources.map(({ handler, ...rest }) => rest),
        previousMessages
    )
    return new Promise<IPluginFunctionCallDescriptor[]>((resolve, reject) => {
        let lastResponse = ''
        client.chat(
            messages,
            {
                onChange: text => {
                    lastResponse = text
                },
                onComplete: () => {
                    try {
                        const chosenFunctions = JSON.parse(lastResponse.trim()) as IPluginFunctionChosenDescriptor[]
                        const descriptors = chosenFunctions
                            .map(item => {
                                const dataSource = allDataSources.find(dataSource => dataSource.name === item.name)
                                const plugin = plugins.find(plugin =>
                                    plugin.dataSources.some(ds => ds.name === item.name)
                                )
                                if (!plugin || !dataSource) {
                                    return undefined
                                }
                                return {
                                    pluginName: plugin?.name,
                                    dataSource,
                                    parameters: item.parameters,
                                }
                            })
                            .filter(Boolean)
                        resolve(descriptors as IPluginFunctionCallDescriptor[])
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
    dataSourcesCallDescriptors: IPluginFunctionCallDescriptor[],
    config: Configuration['pluginsConfig']
): Promise<{ prompt: Message[]; contexts: IPluginContext[] }> => {
    const contexts = await Promise.all(
        dataSourcesCallDescriptors.map(async ({ pluginName, dataSource, parameters }): Promise<IPluginContext> => {
            const [outputs = [], error] = await dataSource
                .handler(parameters, { config })
                .then(res => [res, undefined] as [IPluginFunctionOutput[], undefined])
                .catch(error => [undefined, error] as [undefined, Error])

            return {
                pluginName,
                dataSourceName: dataSource.name,
                dataSourceParameters: parameters,
                outputs,
                error,
            }
        })
    )

    const filteredContexts = contexts.filter(context => !!context.error)
    if (filteredContexts.length === 0) {
        return {
            prompt: [
                {
                    speaker: 'human',
                    text:
                        'I have following responses from external API plugins that I called now:\n' +
                        filteredContexts
                            .map(
                                output => `from "${output.pluginName}":\n\`\`\`json\n${JSON.stringify(output.outputs)}`
                            )
                            .join('\n'),
                },
                {
                    speaker: 'assistant',
                    text: 'Understood, I have additional knowledge when answering your question.',
                },
            ],
            contexts,
        }
    }

    return { prompt: [], contexts }
}
