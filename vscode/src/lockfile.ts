// This is a modified and sligthly stripped down version of
// https://github.com/microsoft/playwright/commit/9943bcfcd862963fc2ae4b221d904fe4f6af8368
// The original seems no longer maintained and has a critical bug
// https://github.com/moxystudio/node-proper-lockfile/issues/111 It was stripped
// to keep dependencies minimal. TODO: This doesn't seem like a very clean
// long-term solution.

/**
 *
 * The MIT License (MIT)
 *
 * Copyright (c) 2018 Made With MOXY Lda <hello@moxy.studio>
 * Modifications copyright (c) Microsoft Corporation.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */
import path from 'node:path'
import defaultFsImplementation from 'graceful-fs'
import { onExit } from 'signal-exit'

type FS = typeof defaultFsImplementation

const locks: Record<string, LockObject> = {}
const pendingTimeouts = new Set<NodeJS.Timeout>()

type LOCK_ERROR_CODE = 'ELOCKED' | 'ECOMPROMISED'

type Precision = 's' | 'ms'
interface LockObject {
    file: string
    lockfilePath: string
    mtime: Date
    mtimePrecision: Precision
    options: InternalLockOptions
    lastUpdate: number
    released: boolean
    updateDelay?: number
    updateTimeout?: NodeJS.Timeout
}

export interface LockOptions {
    stale?: number
    update?: number
    realpath?: boolean
    lockfilePath?: string
}

type CallbackFn<Result, ErrorType = Error> = Result extends void
    ? (err?: ErrorType | null | undefined) => void
    : Result extends Array<any>
      ? ((err: null | undefined, ...result: Result) => void) &
            ((err: ErrorType, ...result: never[]) => void)
      : CallbackFn<[Result], ErrorType>

interface InternalLockOptions {
    update: number
    lockfilePath?: string
    stale: number
    realpath: boolean
    fs: FS
    onCompromised: (error: Error) => void
}

const defaultLockOptions: Pick<InternalLockOptions, 'stale' | 'realpath' | 'fs' | 'onCompromised'> = {
    stale: 10000,
    realpath: true,
    fs: defaultFsImplementation,
    onCompromised: err => {
        throw err
    },
}
export async function lock(
    file: string,
    options?: LockOptions
): Promise<(error?: Error) => Promise<void>> {
    ensureCleanup()
    // options.stale = Math.max(options.stale || 0, 2000)
    // options.update =
    // options.update = Math.max(Math.min(options.update, options.stale / 2), 1000)
    const mergedOptions = { ...defaultLockOptions, ...options }
    const stale = Math.max(mergedOptions.stale || 0, 2000)
    const defaultUpdate = mergedOptions.update == null ? stale / 2 : mergedOptions.update || 0
    const update = Math.max(Math.min(defaultUpdate, stale / 2), 1000)
    const internalOptions: InternalLockOptions = {
        ...mergedOptions,
        stale,
        update,
    }
    return new Promise((resolve, reject) => {
        doLock(file, internalOptions, (err, unlockFn) => {
            if (err) {
                reject(err)
            } else {
                resolve(unlockFn)
            }
        })
    })
}

interface WaitForLockOptions extends LockOptions {
    delay: number
    signal?: AbortSignal
}

export async function waitForLock(
    file: string,
    { delay, signal, ...opts }: WaitForLockOptions
): Promise<() => Promise<void>> {
    while (true) {
        signal?.throwIfAborted()
        const unlockFn = await lock(file, opts).catch(err => {
            if (err && <LOCK_ERROR_CODE>err.code === 'ELOCKED') {
                return undefined
            }
            throw err
        })
        if (unlockFn) {
            return unlockFn
        }
        await sleep(delay)
    }
}

// waits the configured amount of time and (un)registers the timeout so
// that it can be cleaned on shutdown.
function sleep(options: number | { ms: number; unref?: boolean }): Promise<void> {
    const { ms, unref } =
        typeof options === 'number' ? { ms: options, unref: true } : { unref: true, ...options }

    return new Promise(resolve => {
        const timeout = setTimeout(() => {
            pendingTimeouts.delete(timeout)
            resolve()
        }, ms)
        pendingTimeouts.add(timeout)
        timeout.unref && unref && timeout.unref()
    })
}

function schedule(options: number | { ms: number; unref?: boolean }, fn: () => void): NodeJS.Timeout {
    const { ms, unref } =
        typeof options === 'number' ? { ms: options, unref: true } : { unref: true, ...options }
    const timeout = setTimeout(() => {
        pendingTimeouts.delete(timeout)
        fn()
    }, ms)
    pendingTimeouts.add(timeout)

    timeout.unref && unref && timeout.unref()
    return timeout
}

let cachedPrecision: 's' | 'ms' | undefined
function probe(
    file: string,
    { fs }: Pick<InternalLockOptions, 'fs'>,
    callback: CallbackFn<[Date, 's' | 'ms']>
) {
    // Set mtime by ceiling Date.now() to seconds + 5ms so that it's "not on the second"
    const mtime = new Date(Math.ceil(Date.now() / 1000) * 1000 + 5)

    fs.utimes(file, mtime, mtime, err => {
        if (err) {
            return callback(err)
        }

        fs.stat(file, (err, stat) => {
            if (err) {
                return callback(err)
            }

            const precision = cachedPrecision ?? stat.mtime.getTime() % 1000 === 0 ? 's' : 'ms'
            if (!cachedPrecision) {
                cachedPrecision = precision
            }
            callback(null, stat.mtime, precision)
        })
    })
}

function getMtime(precision: Precision) {
    let now = Date.now()

    if (precision === 's') {
        now = Math.ceil(now / 1000) * 1000
    }

    return new Date(now)
}

function getLockFile(file: string, options: InternalLockOptions) {
    return options.lockfilePath || `${file}.lock`
}

function resolveCanonicalPath(
    file: string,
    options: InternalLockOptions,
    callback: CallbackFn<[string]>
) {
    if (!options.realpath) {
        return callback(null, path.resolve(file))
    }

    // Use realpath to resolve symlinks
    // It also resolves relative paths
    options.fs.realpath(file, (err, resolvedPath) => {
        if (err) {
            return callback(err)
        }
        callback(null, resolvedPath)
    })
}

function acquireLock(
    file: string,
    options: InternalLockOptions,
    callback: CallbackFn<[Date, Precision]>
) {
    const lockfilePath = getLockFile(file, options)

    // Use mkdir to create the lockfile (atomic operation)
    options.fs.mkdir(lockfilePath, err => {
        if (!err) {
            // At this point, we acquired the lock!
            // Probe the mtime precision
            return probe(lockfilePath, options, (err, mtime, mtimePrecision) => {
                // If it failed, try to remove the lock..
                if (err) {
                    options.fs.rmdir(lockfilePath, () => {})

                    return callback(err)
                }

                callback(null, mtime, mtimePrecision)
            })
        }

        // If error is not EEXIST then some other error occurred while locking
        if (err.code !== 'EEXIST') {
            return callback(err)
        }

        // Otherwise, check if lock is stale by analyzing the file mtime
        if (options.stale <= 0) {
            return callback(
                Object.assign(new Error('Lock file is already being held'), {
                    code: 'ELOCKED',
                    file,
                })
            )
        }

        options.fs.stat(lockfilePath, (err, stat) => {
            if (err) {
                // Retry if the lockfile has been removed (meanwhile)
                // Skip stale check to avoid recursiveness
                if (err.code === 'ENOENT') {
                    return acquireLock(file, { ...options, stale: 0 }, callback)
                }

                return callback(err)
            }

            if (!isLockStale(stat, options)) {
                return callback(
                    Object.assign(new Error('Lock file is already being held'), {
                        code: 'ELOCKED',
                        file,
                    })
                )
            }

            // If it's stale, remove it and try again!
            // Skip stale check to avoid recursiveness
            removeLock(file, options, err => {
                if (err) {
                    return callback(err)
                }

                acquireLock(file, { ...options, stale: 0 }, callback)
            })
        })
    })
}

function isLockStale(stat: defaultFsImplementation.Stats, options: InternalLockOptions) {
    return stat.mtime.getTime() < Date.now() - options.stale
}

function removeLock(file: string, options: InternalLockOptions, callback: CallbackFn<void>) {
    // Remove lockfile, ignoring ENOENT errors
    options.fs.rmdir(getLockFile(file, options), err => {
        if (err && err.code !== 'ENOENT') {
            return callback(err)
        }

        callback()
    })
}

/**
 * Ensures the lock file doesn't go stale.
 */
function hydrateLock(file: string, options: InternalLockOptions) {
    const lock = locks[file]

    // Just for safety, should never happen
    if (!lock || lock.updateTimeout) {
        return
    }

    lock.updateDelay = lock.updateDelay || options.update
    lock.updateTimeout = schedule(lock.updateDelay, () => {
        lock.updateTimeout = undefined

        // Stat the file to check if mtime is still ours
        // If it is, we can still recover from a system sleep or a busy event loop
        options.fs.stat(lock.lockfilePath, (err, stat) => {
            const isOverThreshold = lock.lastUpdate + options.stale < Date.now()

            // If it failed to update the lockfile, keep trying unless
            // the lockfile was deleted or we are over the threshold
            if (err) {
                if (err.code === 'ENOENT' || isOverThreshold) {
                    return clearLockObject(lock, err)
                }

                lock.updateDelay = 1000

                return hydrateLock(file, options)
            }

            const isMtimeOurs = lock.mtime.getTime() === stat.mtime.getTime()

            if (!isMtimeOurs) {
                return clearLockObject(
                    lock,
                    new Error('Unable to update lock within the stale threshold')
                )
            }

            const mtime = getMtime(lock.mtimePrecision)

            options.fs.utimes(lock.lockfilePath, mtime, mtime, err => {
                const isOverThreshold = lock.lastUpdate + options.stale < Date.now()

                // Ignore if the lock was released
                if (lock.released) {
                    return
                }

                // If it failed to update the lockfile, keep trying unless
                // the lockfile was deleted or we are over the threshold
                if (err) {
                    if (err.code === 'ENOENT' || isOverThreshold) {
                        return clearLockObject(lock, err)
                    }

                    lock.updateDelay = 1000

                    return hydrateLock(file, options)
                }

                // All ok, keep updating..
                lock.mtime = mtime
                lock.lastUpdate = Date.now()
                lock.updateDelay = undefined
                hydrateLock(file, options)
            })
        })
    })
}

function clearLockObject(lock: LockObject, compromised?: Error) {
    lock.released = true
    if (lock.updateTimeout) {
        clearTimeout(lock.updateTimeout)
        pendingTimeouts.delete(lock.updateTimeout)
        lock.updateTimeout = undefined
    }
    if (locks[lock.file] === lock) {
        delete locks[lock.file]
    }

    compromised && lock.options.onCompromised?.(Object.assign(compromised, { code: 'ECOMPROMISED' }))
}

// function setLockAsCompromised(file, lock, err) {
//     // Signal the lock has been released
//     lock.released = true

//     // Cancel lock mtime update
//     // Just for safety, at this point updateTimeout should be null
//     /* istanbul ignore if */
//     if (lock.updateTimeout) {
//         clearTimeout(lock.updateTimeout)
//     }

//     if (locks[file] === lock) {
//         delete locks[file]
//     }

//     lock.options.onCompromised(err)
// }

// ----------------------------------------------------------

function doLock(file: string, options: InternalLockOptions, callback: CallbackFn<() => Promise<void>>) {
    // Resolve to a canonical file path
    resolveCanonicalPath(file, options, (err, file) => {
        if (err) {
            return callback(err)
        }

        // Attempt to acquire the lock
        acquireLock(file, options, (err, mtime, mtimePrecision) => {
            if (err) {
                return callback(err)
            }

            // We now own the lock
            const lockObj = {
                file,
                lockfilePath: getLockFile(file, options),
                mtime,
                mtimePrecision,
                options,
                lastUpdate: Date.now(),
                released: false,
            }
            locks[file] = lockObj

            // We must keep the lock fresh to avoid staleness
            hydrateLock(file, options)

            const releaseFn = async () => {
                if (lockObj.released) {
                    throw Object.assign(new Error('Lock is already released'), {
                        code: 'ERELEASED',
                    })
                }

                // Not necessary to use realpath twice when unlocking
                await new Promise((resolve, reject) => {
                    unlock(file, { ...options, realpath: false }, err => {
                        if (err) {
                            return reject(err)
                        }
                        resolve(null)
                    })
                })
            }
            callback(null, releaseFn)
        })
    })
}

function unlock(file: string, options: InternalLockOptions, callback: CallbackFn<void>) {
    // Resolve to a canonical file path
    resolveCanonicalPath(file, options, (err, file) => {
        if (err) {
            return callback(err)
        }

        // Skip if the lock is not acquired
        const lock = locks[file]

        if (!lock) {
            return callback(
                Object.assign(new Error('Lock is not acquired/owned by you'), { code: 'ENOTACQUIRED' })
            )
        }

        lock.updateTimeout && clearTimeout(lock.updateTimeout) // Cancel lock mtime update
        lock.released = true // Signal the lock has been released
        delete locks[file] // Delete from locks

        removeLock(file, options, callback)
    })
}

// Remove acquired locks on exit
let cleanupInitialized = false
function ensureCleanup() {
    if (cleanupInitialized) {
        return
    }
    cleanupInitialized = true
    onExit(() => {
        for (const timer in pendingTimeouts) {
            try {
                clearTimeout(timer)
            } catch (e) {
                /* Empty */
            }
        }
        for (const file in locks) {
            const options = locks[file].options

            try {
                options.fs.rmdirSync(getLockFile(file, options))
            } catch (e) {
                /* Empty */
            }
        }
    })
}
