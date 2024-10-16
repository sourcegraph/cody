import { test as _test } from '@playwright/test'
import type { EXPIRY_STRATEGY, MODE } from '@pollyjs/core'
import type { ArrayContainsAll } from '@sourcegraph/cody-shared/src/utils'
import 'node:http'
import 'node:https'
import path from 'node:path'
import { cenv } from '@sourcegraph/cody-shared'
import zod from 'zod'
import type { TestContext, WorkerContext } from '.'
import { CODY_VSCODE_ROOT_DIR } from '../../helpers'

const zAbsPath = () => zod.string().transform(p => path.resolve(CODY_VSCODE_ROOT_DIR, p))

type CenvKeys = keyof typeof cenv
type CodyEnvTuple = typeof cenv extends { [K in CenvKeys]: any } ? [CenvKeys, ...CenvKeys[]] : never

const workerOptionsSchema = zod.object({
    forbidNonPlayback: zod
        .boolean()
        .default(true)
        .describe(
            'Forbid the use of record/passthrough for MitM requests. This is useful in CI to prevent accidentally comitted config overrides'
        ),
    vscodeCommitSha: zod.string().nullable().default(null),
    vscodeExtensionCacheDir: zAbsPath(),
    globalTmpDir: zAbsPath(),
    vscodeTmpDir: zAbsPath(),
    vscodeServerTmpDir: zAbsPath(),
    binaryTmpDir: zAbsPath(),
    pollyRecordingDir: zAbsPath(),
    debugMode: zod.boolean().default(false),
    keepFinishedTestRunning: zod
        .boolean()
        .default(false)
        .describe(
            'Keeps the UI and browser running after a completed test so you can manually continue interacting'
        ),
    vscodeServerPortRange: zod.tuple([zod.number(), zod.number()]).default([33100, 33200]),
    mitmServerPortRange: zod.tuple([zod.number(), zod.number()]).default([34100, 34200]),
    keepRuntimeDirs: zod.enum(['all', 'failed', 'none']).default('none'),
    waitForExtensionHostDebugger: zod.boolean().default(false),
})

const onlyTestOptionsSchema = zod.object({
    vscodeVersion: zod.string().default('stable'),
    vscodeExtensions: zod.array(zod.string().toLowerCase()).default([]),
    symlinkExtensions: zod.array(zAbsPath()).default([]),
    templateWorkspaceDir: zAbsPath(),
    recordingMode: zod
        .enum(['passthrough', 'record', 'replay', 'stopped'] satisfies ArrayContainsAll<MODE>)
        .default('replay'),
    recordIfMissing: zod.boolean().default(false),
    keepUnusedRecordings: zod.boolean().default(true),
    recordingExpiryStrategy: zod
        .enum(['record', 'warn', 'error'] satisfies ArrayContainsAll<EXPIRY_STRATEGY>)
        .default('error'),
    recordingExpiresIn: zod.string().nullable().default(null),
    codyEnvVariables: zod
        .record(zod.enum(Object.keys(cenv) as CodyEnvTuple), zod.string().optional())
        .default({}),
})

const combinedOptionsSchema = zod
    .intersection(workerOptionsSchema, onlyTestOptionsSchema)
    .superRefine((opt, ctx) => {
        if (opt.forbidNonPlayback) {
            if (opt.recordIfMissing) {
                ctx.addIssue({
                    code: zod.ZodIssueCode.custom,
                    message: 'recordIfMissing is not allowed when forbidNonPlayback is enabled',
                    path: ['recordIfMissing'],
                })
            }
            if (opt.recordingExpiryStrategy === 'record') {
                ctx.addIssue({
                    code: zod.ZodIssueCode.custom,
                    message: `recordingExpiryStrategy can't be "record" when forbidNonPlayback is enabled`,
                    path: ['recordingExpiryStrategy'],
                })
            }
            if (opt.recordingMode !== 'replay') {
                ctx.addIssue({
                    code: zod.ZodIssueCode.custom,
                    message: `recordingMode can't be anything other than "replay" when forbidNonPlayback is enabled`,
                    path: ['recordingMode'],
                })
            }
        }
    })

export type TestOptions = zod.infer<typeof onlyTestOptionsSchema>
export type WorkerOptions = zod.infer<typeof workerOptionsSchema>
type CombinedOptions = zod.infer<typeof combinedOptionsSchema>

// We split out the options fixutre from the implementation fixture so that in
// the implementaiton fixture we don't accidentally use any options directly,
// instead having to use validated options
export const optionsFixture: ReturnType<
    typeof _test.extend<Pick<TestContext, 'validOptions'>, Pick<WorkerContext, 'validWorkerOptions'>>
> = _test.extend<
    TestOptions & Pick<TestContext, 'validOptions'>,
    WorkerOptions & Pick<WorkerContext, 'validWorkerOptions'>
>({
    ...schemaOptions(workerOptionsSchema, 'worker'),
    ...schemaOptions(onlyTestOptionsSchema, 'test'),
    validWorkerOptions: [
        async (
            {
                binaryTmpDir,
                keepFinishedTestRunning,
                debugMode,
                pollyRecordingDir,
                globalTmpDir,
                vscodeTmpDir,
                vscodeCommitSha,
                vscodeServerTmpDir,
                vscodeExtensionCacheDir,
                keepRuntimeDirs,
                vscodeServerPortRange,
                mitmServerPortRange,
                waitForExtensionHostDebugger,
                forbidNonPlayback,
            },
            use
        ) => {
            const validOptionsWithDefaults = await workerOptionsSchema.safeParseAsync(
                {
                    binaryTmpDir,
                    keepFinishedTestRunning,
                    debugMode,
                    pollyRecordingDir,
                    globalTmpDir,
                    vscodeCommitSha,
                    vscodeTmpDir,
                    vscodeServerTmpDir,
                    vscodeExtensionCacheDir,
                    keepRuntimeDirs,
                    vscodeServerPortRange,
                    mitmServerPortRange,
                    waitForExtensionHostDebugger,
                    forbidNonPlayback,
                } satisfies { [key in keyof WorkerOptions]-?: WorkerOptions[key] },
                {}
            )
            if (!validOptionsWithDefaults.success) {
                throw new TypeError(
                    `Invalid worker arguments:\n${JSON.stringify(
                        validOptionsWithDefaults.error.flatten().fieldErrors,
                        null,
                        2
                    )}`
                )
            }
            use(validOptionsWithDefaults.data)
        },
        { scope: 'worker', auto: true },
    ],
    validOptions: [
        async (
            {
                codyEnvVariables,
                vscodeExtensions,
                symlinkExtensions,
                vscodeVersion,
                templateWorkspaceDir,
                recordIfMissing,
                recordingMode,
                keepUnusedRecordings,
                recordingExpiresIn,
                recordingExpiryStrategy,
                validWorkerOptions,
            },
            use
        ) => {
            const validOptionsWithDefaults = await combinedOptionsSchema.safeParseAsync(
                {
                    codyEnvVariables,
                    vscodeExtensions,
                    symlinkExtensions,
                    vscodeVersion,
                    keepUnusedRecordings,
                    recordingExpiresIn,
                    recordingExpiryStrategy,
                    templateWorkspaceDir,
                    recordIfMissing,
                    recordingMode,
                    ...validWorkerOptions,
                } satisfies { [key in keyof CombinedOptions]-?: CombinedOptions[key] },
                {}
            )
            if (!validOptionsWithDefaults.success) {
                throw new TypeError(
                    `Invalid test arguments:\n${JSON.stringify(
                        validOptionsWithDefaults.error.flatten().fieldErrors,
                        null,
                        2
                    )}`
                )
            }
            use(validOptionsWithDefaults.data)
        },
        { scope: 'test', auto: true },
    ],
})

function schemaOptions<T extends zod.ZodObject<any>, S extends 'worker' | 'test'>(o: T, s: S) {
    return Object.fromEntries(
        Object.keys(o.shape).map(key => [key, [undefined, { scope: s, option: true }]])
    ) as unknown as { [k in keyof T]: [T[k], { scope: S; option: true }] }
}
