/* eslint-disable no-constant-condition, @typescript-eslint/no-empty-function */
interface Log {
    completionPostProcessId?: string
    stage: string
    text?: string
    obj?: Record<string, unknown>
    isCollapsedGroup?: boolean
}

class GroupedLogger {
    private logs: Map<string, Log[]> = new Map()

    public info(logObj: Log): void {
        const id = logObj.completionPostProcessId

        if (!id) {
            return
        }

        if (!this.logs.has(id)) {
            this.logs.set(id, [])
        }

        this.logs.get(id)?.push(logObj)
    }

    public flush(): void {
        for (const [id, msgs] of this.logs) {
            if (msgs.length < 2) {
                break
            }

            const [{ stage, isCollapsedGroup }] = msgs
            const groupStart = isCollapsedGroup ? console.groupCollapsed : console.group
            groupStart(`Grouped Logs for ID ${id}-${stage}`)

            for (const { stage, text = '', obj } of msgs) {
                logStage(stage, text, obj)
            }
            console.groupEnd()
        }

        this.logs.clear()
    }
}

/**
 * @deprecated
 * Will be replaced with an OpenTelemetry console exporter and manual spans.
 */
export const completionPostProcessLogger = true ? { info() {}, flush() {} } : new GroupedLogger()

function logStage(stage: string, text: string, obj?: Record<string, unknown>): void {
    console.log(
        `%c${stage}%c: ${obj ? JSON.stringify(obj) : ''}\n${text}`,
        'color: green; font-weight:bold',
        'color: black; font-weight: normal;'
    )
}
