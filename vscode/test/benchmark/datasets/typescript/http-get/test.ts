import { server } from './server'
import { fetchCurrentUser } from './solution'

const serverInstance = server.listen(3000, async () => {
    try {
        await fetchCurrentUser()
    } catch {
        throw new Error('Error fetching current user')
    } finally {
        serverInstance.close()
    }
})
