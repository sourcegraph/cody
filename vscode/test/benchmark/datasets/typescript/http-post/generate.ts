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
        █
    })
}
