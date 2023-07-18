import { Plugin, PluginAPI, PluginFunctionOutput, PluginFunctionParameters } from '../api/types'

import { fetchAPINinjas } from './lib/fetch-api-ninjas'

export const airQualityPlugin: Plugin = {
    name: 'Air Quality plugin',
    description: 'Get air quality information for any city in the world.',
    dataSources: [
        {
            descriptor: {
                name: 'get_air_quality_in_city',
                description:
                    'This API provides the latest air quality information for any city in the world. It provides not only the overall Air Quality Index (AQI) but also concentrations for major pollutants such as Carbon monoxide (CO), Nitrogen dioxide (NO2), Ozone (O3), Sulphur dioxide (SO2), PM2.5 particulates, and PM10 particulates.',
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
