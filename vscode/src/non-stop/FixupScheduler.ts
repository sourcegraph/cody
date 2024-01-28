import type { FixupIdleTaskRunner } from './roles'

/**
 * Runs callbacks "later".
 */
export class FixupScheduler implements FixupIdleTaskRunner {
    private work_: (() => void)[] = []
    private timeout_: TimerCompat
    private scheduled_ = false

    constructor(delayMsec: number) {
        this.timeout_ = setTimeoutCompat(this.doWorkNow.bind(this), delayMsec).unref()
    }

    // TODO: Consider making this disposable and not running tasks after
    // being disposed

    // TODO: Add a callback so the scheduler knows when the user is typing
    // and add a cooldown period

    /**
     * Schedules a callback which will run when the event loop is idle.
     * @param worker the callback to run.
     */
    public scheduleIdle<T>(worker: () => T): Promise<T> {
        if (!this.work_.length) {
            // First work item, so schedule the window callback
            this.scheduleCallback()
        }
        return new Promise((resolve, reject) => {
            this.work_.push(() => {
                try {
                    resolve(worker())
                } catch (error: any) {
                    reject(error)
                }
            })
        })
    }

    private scheduleCallback(): void {
        if (!this.scheduled_) {
            this.scheduled_ = true
            this.timeout_.refresh()
        }
    }

    public doWorkNow(): void {
        this.scheduled_ = false
        const item = this.work_.shift()
        if (!item) {
            return
        }
        if (this.work_.length) {
            this.scheduleCallback()
        }
        item()
    }
}

/**
 * No-op wrapper for a Node.js timer, or a compatibility wrapper for a DOM timeout handle.
 */
interface TimerCompat {
    refresh(): void
    unref(): TimerCompat
}

/**
 * No-op wrapper for Node.js `setTimeout` or a compatibility wrapper for DOM `setTimeout`.
 */
function setTimeoutCompat(callback: () => unknown, delayMsec: number): TimerCompat {
    const handle = setTimeout(callback, delayMsec) as NodeJS.Timeout | number
    if (typeof handle === 'number') {
        let latestHandle = handle
        const compatHandle: TimerCompat = {
            refresh() {
                clearTimeout(latestHandle)
                latestHandle = setTimeout(callback, delayMsec) as unknown as number
            },
            unref() {
                // noop
                return compatHandle
            },
        }
        return compatHandle
    }
    return handle
}
