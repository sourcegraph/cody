import { fetchCurrentUser } from './generate'
import { server } from './server'

const serverInstance = server.listen(3000, async () => {
    try {
        await fetchCurrentUser()
    } catch {
        throw new Error('Error fetching current user')
    } finally {
        serverInstance.close()
    }
})
