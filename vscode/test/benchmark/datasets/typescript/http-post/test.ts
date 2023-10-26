import { makeCreateUserRequest } from './generate'
import { server } from './server'

const serverInstance = server.listen(3000, async () => {
    try {
        await makeCreateUserRequest({ firstName: 'John', lastName: 'Doe' })
    } catch {
        throw new Error('Error fetching current user')
    } finally {
        serverInstance.close()
    }
})
