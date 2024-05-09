import { type LogTraceSinksConfig, LogTraceSinksService } from './sinks'

export class LogTraceNodeSinksService extends LogTraceSinksService {
    protected reconfigure(previousConfig: LogTraceSinksConfig): void {
        throw new Error('Method not implemented.')
    }
}
