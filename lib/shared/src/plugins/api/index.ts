import { ChatClient } from '../../chat/chat'
import { Configuration } from '../../configuration'
import { Message } from '../../sourcegraph-api/completions/types'

import { makePrompt } from './prompt'
import { IPlugin, IPluginContext, IPluginFunctionCallDescriptor, IPluginFunctionChosenDescriptor } from './types'

export const chooseDataSources = (
    humanChatInput: string,
    client: ChatClient,
    plugins: IPlugin[],
    history: Message[] = []
): Promise<IPluginFunctionCallDescriptor[]> => {
    const allDataSources = plugins.flatMap(plugin => plugin.dataSources)

    const messages = makePrompt(
        humanChatInput,
        allDataSources.map(({ handler, ...rest }) => rest),
        history
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

export const getContext = async (
    dataSourcesCallDescriptors: IPluginFunctionCallDescriptor[],
    config: Configuration['pluginsConfig'],
    debug = false
): Promise<{ prompt?: Message[]; context?: IPluginContext[] }> => {
    const output = await Promise.all(
        dataSourcesCallDescriptors.map(async ({ pluginName, dataSource, parameters }) => {
            const response = await dataSource.handler(parameters, { config }).catch(error => {
                console.error(error)
                return []
            })

            if (!response.length) {
                return
            }
            return {
                pluginName,
                dataSourceName: dataSource.name,
                dataSourceParameters: debug ? parameters : undefined,
                context: response,
            } as IPluginContext
        })
    )

    const filteredOutput = output.filter((output): output is IPluginContext => output !== undefined)
    if (filteredOutput.length === 0) {
        return {}
    }

    const prompt = [
        {
            speaker: 'human',
            text:
                'I have following responses from external API plugins that I called now:\n' +
                filteredOutput
                    .map(output => `from "${output.pluginName}":\n\`\`\`json\n${JSON.stringify(output.context)}`)
                    .join('\n'),
        },
        {
            speaker: 'assistant',
            text: 'Understood, I have additional knowledge when answering your question.',
        },
    ] as Message[]

    return { prompt, context: filteredOutput }
}
