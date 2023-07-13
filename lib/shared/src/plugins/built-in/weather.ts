import { Plugin, PluginAPI, PluginFunctionOutput, PluginFunctionParameters } from '../api/types'

import { fetchAPINinjas } from './lib/fetch-api-ninjas'

export const weatherPlugin: Plugin = {
    name: 'Weather plugin',
    description: 'Get weather information for any city in the world.',
    dataSources: [
        {
            descriptor: {
                name: 'get_city_weather_info',
                description:
                    "The API provides the latest weather information for any city in the world. The API returns a variety of weather data including wind speed, wind degrees, temperature, humidity, sunset and sunrise times, minimum and maximum temperatures, cloud percentage, and the 'feels like' temperature.",
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
