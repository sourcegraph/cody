import { IPlugin, IPluginAPI, IPluginFunctionOutput, IPluginFunctionParameters } from '../api/types'

import { fetchAPINinjas } from './lib/fetch-api-ninjas'

export const weatherPlugin: IPlugin = {
    name: 'Weather plugin',
    description: 'Search weather. Use this to find out what is the weather today in different cities.',
    dataSources: [
        {
            name: 'get_current_weather',
            description: 'Get the current weather in a given city',
            parameters: {
                type: 'object',
                properties: {
                    city: {
                        type: 'string',
                        description: 'A valid full city name to get the weather for, e.g San Francisco',
                    },
                },
                required: ['city'],
            },
            handler: (parameters: IPluginFunctionParameters, api: IPluginAPI): Promise<IPluginFunctionOutput[]> => {
                if (typeof parameters?.city !== 'string') {
                    return Promise.reject(new Error('Invalid parameters'))
                }
                const url = 'https://api.api-ninjas.com/v1/weather?city=' + parameters.city
                const apiKey = api.config?.apiNinjas?.apiKey
                if (!apiKey) {
                    return Promise.reject(new Error('Missing API key'))
                }
                return fetchAPINinjas(url, apiKey).then(async response => {
                    if (!response.ok) {
                        return [
                            {
                                url,
                                error: 'Could not fetch weather data',
                            },
                        ]
                    }
                    const json = await response.json()
                    return [
                        {
                            url,
                            city: parameters.city,
                            temperature: json.temp,
                            feels_like: json.feels_like,
                            max_temperature: json.temp_max,
                        },
                    ]
                })
            },
        },
    ],
}
