// import { test as t } from '@playwright/test'
import { SessionChild } from './sessionChild'

//TODO: classify type based on presence of different codicons
export class Notifications extends SessionChild {
    get toasts() {
        return this.session.page.locator('.notifications-toasts .notification-toast')
    }
}
