import { type LogTraceSinksConfig, LogTraceSinksService } from './sinks'

export class LogTraceWebSinksService extends LogTraceSinksService {
    protected reconfigure(previousConfig: LogTraceSinksConfig): void {
        throw new Error('Method not implemented.')
    }
}
