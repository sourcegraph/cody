import * as fspromises from 'fs/promises'
import * as path from 'path'
import { Mutex } from 'async-mutex';


export class StrategySimpleChatLogs {
    private logFilePath: string
    private logFilePathLatest: string
    private logMutex: Mutex

    constructor() {
        this.logFilePath = `/home/hiteshsagtani/dev/e2e-chat-evaluation-workspace/run_logs/${new Date().toISOString()}/file.log`;
        this.logFilePathLatest = `/home/hiteshsagtani/dev/e2e-chat-evaluation-workspace/run_logs/latest/file.log`;
        this.logMutex = new Mutex();
    }

    async initialize() {
        await this.createLogFile();
        await this.clearLogFilePathLatest();
    }

    clearLogFilePathLatest = async (): Promise<void> => {
        try {
            await fspromises.writeFile(this.logFilePathLatest, '');
        } catch (error) {
            console.error('Error clearing log file:', error);
        }
    }

    createLogFile = async (): Promise<void> => {
        try {
            await fspromises.mkdir(path.dirname(this.logFilePath), { recursive: true });
            // await fspromises.writeFile(logFilePath, '');
        } catch (error) {
            console.error('Error creating log file:', error);
        }
    }

    writeLog = async (repoDisplayName: string, log: string): Promise<void> => {
        const logPrefix = `logTime: ${new Date().toISOString()} repoName: ${repoDisplayName}`
        const newLogMessage = `${logPrefix} ${log}`
        await this._writeLog(newLogMessage)
    }

    _writeLog = async (log: string): Promise<void> => {
        try {
            await this.logMutex.runExclusive(async () => {
                console.log(log)
                await fspromises.appendFile(this.logFilePath, log + '\n')
                await fspromises.appendFile(this.logFilePathLatest, log + '\n')
            });
        } catch (error) {
            console.error('Error writing log:', error);
        }
    }
}

