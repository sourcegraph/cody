import { notifyUsers } from './generate'
import { User } from './types'

const users: User[] = [
    {
        firstName: 'John',
        lastName: 'Doe',
        contacts: [
            {
                type: 'email',
                value: 'john.doe@example.com',
            },
            {
                type: 'phone',
                value: '555-123-456',
            },
        ],
    },
    {
        firstName: 'Marry',
        lastName: 'Me',
        contacts: [
            {
                type: 'email',
                value: 'marry.me@example.com',
            },
            {
                type: 'phone',
                value: '435-123-456',
            },
        ],
    },
]

notifyUsers(users, 'Hi! This is a test notification')
