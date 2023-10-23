export interface Notification {
    send(): void
}

export class EmailNotification implements Notification {
    constructor(private message: string) {}
    public send() {
        console.log(`Sending an email notification: "${this.message}"`)
    }
}

export class SlackNotification implements Notification {
    constructor(private message: string) {}
    public send() {
        console.log(`Sending a Slack notification: "${this.message}"`)
    }
}

export class SecretMessenger {
    constructor(private phone: string) {}
    public login() {
        console.log('Logging in to Secret Messenger')
    }

    public setPort() {
        console.log(`Setting port for Secret Messenger for phone number ${this.phone}`)
    }

    public sendSecretMessage(message: string) {
        console.log(`Sending a secret messenger notification: "${message}"`)
    }
}

export class SecretMessengerAdapter implements Notification {
    constructor(
        private secretMessenger: SecretMessenger,
        private message: string
    ) {}

    public send() {
        this.secretMessenger.login()
        this.secretMessenger.setPort()
        this.secretMessenger.sendSecretMessage(this.message)
    }
}
