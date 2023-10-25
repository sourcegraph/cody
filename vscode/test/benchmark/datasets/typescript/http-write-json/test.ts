import http from 'http'

import { server } from './generate'

const PORT = 3000

const message = 'Hello, world!'

async function makeRequest(): Promise<void> {
    return new Promise((resolve, reject) => {
        http.get(`http://localhost:${PORT}`, res => {
            let data = ''
            res.on('data', chunk => {
                data += chunk
            })

            res.on('end', () => {
                if (res.statusCode !== 200) {
                    return reject(new Error(`Expected status code 200 but received ${res.statusCode}`))
                }

                const responseData = JSON.parse(data)
                if (responseData.message !== message) {
                    return reject(new Error(`Response message should be "${message}", got: "${responseData.message}"`))
                }
                resolve()
            })
        }).on('error', reject)
    })
}

const serverInstance = server.listen(PORT, async () => {
    try {
        await makeRequest()
    } finally {
        serverInstance.close()
    }
})
