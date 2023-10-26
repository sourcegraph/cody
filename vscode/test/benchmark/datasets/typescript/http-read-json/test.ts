import http from 'http'

import { server } from './generate'

const PORT = 3000

interface User {
    firstName: string
    lastName: string
}

async function makeRequest(user: User): Promise<User> {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'localhost',
            port: PORT,
            path: '/user/create',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
        }

        const req = http.request(options, res => {
            let data = ''
            res.on('data', chunk => {
                data += chunk
            })

            res.on('end', () => {
                if (res.statusCode !== 200) {
                    return reject(new Error(`Expected status code 200 but received ${res.statusCode}`))
                }

                try {
                    const responseData = JSON.parse(data)
                    resolve(responseData.data)
                } catch (error) {
                    reject(new Error('Error parsing JSON response'))
                }
            })
        })

        req.on('error', reject)
        req.write(JSON.stringify(user))
        req.end()
    })
}

const serverInstance = server.listen(PORT, async () => {
    try {
        const responseData = await makeRequest({ firstName: 'John', lastName: 'Doe' })
        if (responseData.firstName !== 'John' || responseData.lastName !== 'Doe') {
            throw new Error('Invalid user data')
        }
    } finally {
        serverInstance.close()
    }
})
