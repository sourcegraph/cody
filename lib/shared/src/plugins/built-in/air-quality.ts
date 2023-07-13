import { Plugin, PluginAPI, PluginFunctionOutput, PluginFunctionParameters } from '../api/types'

import { fetchAPINinjas } from './lib/fetch-api-ninjas'

export const airQualityPlugin: Plugin = {
    name: 'Air Quality plugin',
    description: 'Search air quality. Use this to find out what is the air quality in different cities.',
    dataSources: [
        {
            descriptor: {
                name: 'get_airquality_in_city',
                description: 'Get the current air quality for a given city',
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
            },
            handler: (parameters: PluginFunctionParameters, api: PluginAPI): Promise<PluginFunctionOutput[]> => {
                if (typeof parameters?.city !== 'string') {
                    return Promise.reject(new Error('Invalid parameters'))
                }
                const url = 'https://api.api-ninjas.com/v1/airquality?city=' + parameters.city
                const apiKey = api.config?.apiNinjas?.apiKey
                if (!apiKey) {
                    return Promise.reject(new Error('Missing API key'))
                }
                return fetchAPINinjas(url, apiKey).then(async response => {
                    if (!response.ok) {
                        return [
                            {
                                url,
                                error: 'Could not fetch air quality data',
                            },
                        ]
                    }
                    const json = await response.json()
                    return [
                        {
                            url,
                            city: parameters.city,
                            ...json,
                        },
                    ]
                })
            },
        },
    ],
}
