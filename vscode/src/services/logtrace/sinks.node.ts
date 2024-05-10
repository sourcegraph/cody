import { type LogTraceSinksConfig, LogTraceSinksService } from './sinks'

export class LogTraceNodeSinksService extends LogTraceSinksService {
    protected reconfigure(previousConfig: LogTraceSinksConfig): void {}
}
