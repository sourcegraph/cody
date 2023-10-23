import {
    EmailNotification,
    Notification,
    SecretMessenger,
    SecretMessengerAdapter,
    SlackNotification,
} from './notification'
import { User } from './types'

export function notifyUsers(users: User[], message: string): void {
    for (const user of users) {
        for (const contact of user.contacts) {
            let notification: Notification

            switch (contact.type) {
                case 'email': {
                    notification = new EmailNotification(message)
                    break
                }
                case 'slack': {
                    notification = new SlackNotification(message)
                    break
                }
                case 'phone': {
                    notification = new SecretMessengerAdapter(new SecretMessenger(contact.value), message)
                    break
                }
                default:
                    continue
            }

            notification?.send()
        }
    }
}
