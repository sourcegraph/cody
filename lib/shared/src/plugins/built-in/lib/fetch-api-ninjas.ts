import fetch from 'isomorphic-fetch'

export const fetchAPINinjas = (url: string, apiKey: string): Promise<any> =>
    fetch(url, {
        method: 'GET',
        headers: {
            'X-API-Key': apiKey,
        },
    })
