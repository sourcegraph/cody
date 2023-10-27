import { generateDummyUser } from './generate'

const user = generateDummyUser()
if (!user.firstName || !user.lastName || !user.age) {
    throw new Error('Incorrect result')
}
