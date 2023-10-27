import { parseUsers as generatedParseUsers } from './generate'
import { parseUsers } from './solution'

const actual = generatedParseUsers()
const expected = parseUsers()

expected.forEach((user, i) => {
    console.log(user)
    if (user.fullName !== actual[i].fullName || user.age !== actual[i].age) {
        throw new Error('Incorrect result')
    }
})
