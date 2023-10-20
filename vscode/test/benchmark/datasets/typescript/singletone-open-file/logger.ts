export class Logger {
    public history: any[] = []

    static instance: Logger
    private constructor() {}

    public static getInstance(): Logger {
        if (!Logger.instance) {
            Logger.instance = new Logger()
        }
        return Logger.instance
    }

    log(data: any, type?: 'info' | 'error'): void {
        this.history.push(data)
        console[type ?? 'log'](data)
    }
}
