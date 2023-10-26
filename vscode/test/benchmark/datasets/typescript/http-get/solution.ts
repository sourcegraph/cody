import http from 'http'

const CURRENT_USER_URL = 'http://localhost:3000/current-user'

export async function fetchCurrentUser(): Promise<void> {
    return new Promise((resolve, reject) => {
        http.get(CURRENT_USER_URL, res => {
            res.on('data', () => {})
            res.on('end', () => (res.statusCode === 200 ? resolve() : reject()))
        }).on('error', reject)
    })
}
