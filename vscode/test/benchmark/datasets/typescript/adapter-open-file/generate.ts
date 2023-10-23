import {
    EmailNotification,
    Notification,
    SecretMessenger,
    SecretMessengerAdapter,
    SlackNotification,
} from './notification'
import { User } from './types'

export function notifyUsers(users: User[], message: string): void {█
