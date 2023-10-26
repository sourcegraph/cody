import http from 'http'

interface User {
    firstName: string
    lastName: string
}

export async function createUser(user: User): Promise<{ data: User; status: number }> {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'localhost',
            port: 3000,
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
                // success
                if (res.statusCode === 200) {
                    try {
                        const responseData = JSON.parse(data)
                        return resolve({ data: responseData.data, status: res.statusCode })
                    } catch (error) {
                        return reject(new Error('Error parsing JSON response'))
                    }
                }

                // failure
                return reject()
            })
        })

        req.on('error', reject)
        req.write(JSON.stringify(user))
        req.end()
    })
}
