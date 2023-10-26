import http from 'http'

interface User {
    firstName: string
    lastName: string
}

const HOSTNAME = 'localhost'
const PORT = 3000
const CREATE_USER_PATH = '/user/create'

export async function makeCreateUserRequest(user: User): Promise<void> {
    return new Promise((resolve, reject) => {
        const req = http.request(
            {
                hostname: HOSTNAME,
                port: PORT,
                path: CREATE_USER_PATH,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
            },
            res => {
                res.on('data', () => {})
                res.on('end', () => (res.statusCode === 200 ? resolve() : reject()))
            }
        )

        req.on('error', reject)
        req.write(JSON.stringify(user))
        req.end()
    })
}
