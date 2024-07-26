import { test as _test } from '@playwright/test'
import type { EXPIRY_STRATEGY, MODE } from '@pollyjs/core'
import type { ArrayContainsAll } from '@sourcegraph/cody-shared/src/utils'
import 'node:http'
import 'node:https'
import path from 'node:path'
import zod from 'zod'
import type { TestContext, WorkerContext } from '.'
import { CODY_VSCODE_ROOT_DIR } from '../../helpers'

const zAbsPath = () => zod.string().transform(p => path.resolve(CODY_VSCODE_ROOT_DIR, p))
const workerOptionsSchema = zod.object({
    repoRootDir: zAbsPath().describe(
        'DEPRECATED: The .git root of this project. Might still get used for some path defaults so must be set'
    ),
    vscodeExtensionCacheDir: zAbsPath(),
    globalTmpDir: zAbsPath(),
    vscodeTmpDir: zAbsPath(),
    vscodeServerTmpDir: zAbsPath(),
    binaryTmpDir: zAbsPath(),
    recordingDir: zAbsPath(),
    vscodeServerPortRange: zod.tuple([zod.number(), zod.number()]).default([33100, 33200]),
    mitmServerPortRange: zod.tuple([zod.number(), zod.number()]).default([34100, 34200]),
    keepRuntimeDirs: zod.enum(['all', 'failed', 'none']).default('none'),
    allowGlobalVSCodeModification: zod.boolean().default(false),
    waitForExtensionHostDebugger: zod.boolean().default(false),
})

const testOptionsSchema = zod.object({
    vscodeVersion: zod.string().default('stable'),
    vscodeExtensions: zod.array(zod.string().toLowerCase()).default([]),
    templateWorkspaceDir: zAbsPath(),
    recordingMode: zod.enum([
        'passthrough',
        'record',
        'replay',
        'stopped',
    ] satisfies ArrayContainsAll<MODE>),
    recordIfMissing: zod.boolean(),
    keepUnusedRecordings: zod.boolean().default(true),
    recordingExpiryStrategy: zod
        .enum(['record', 'warn', 'error'] satisfies ArrayContainsAll<EXPIRY_STRATEGY>)
        .default('record'),
    recordingExpiresIn: zod.string().nullable().default(null),
})

export type TestOptions = zod.infer<typeof testOptionsSchema>
export type WorkerOptions = zod.infer<typeof workerOptionsSchema>

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
    ...schemaOptions(testOptionsSchema, 'test'),
    validWorkerOptions: [
        async (
            {
                repoRootDir,
                binaryTmpDir,
                recordingDir,
                globalTmpDir,
                vscodeTmpDir,
                vscodeServerTmpDir,
                vscodeExtensionCacheDir,
                keepRuntimeDirs,
                vscodeServerPortRange,
                mitmServerPortRange,
                allowGlobalVSCodeModification,
                waitForExtensionHostDebugger,
            },
            use
        ) => {
            const validOptionsWithDefaults = await workerOptionsSchema.safeParseAsync(
                {
                    repoRootDir,
                    binaryTmpDir,
                    recordingDir,
                    globalTmpDir,
                    vscodeTmpDir,
                    vscodeServerTmpDir,
                    vscodeExtensionCacheDir,
                    keepRuntimeDirs,
                    vscodeServerPortRange,
                    mitmServerPortRange,
                    allowGlobalVSCodeModification,
                    waitForExtensionHostDebugger,
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
                vscodeExtensions,
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
            const validOptionsWithDefaults = await testOptionsSchema.safeParseAsync(
                {
                    vscodeExtensions,
                    vscodeVersion,
                    keepUnusedRecordings,
                    recordingExpiresIn,
                    recordingExpiryStrategy,
                    templateWorkspaceDir,
                    recordIfMissing,
                    recordingMode,
                } satisfies { [key in keyof TestOptions]-?: TestOptions[key] },
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
            use({ ...validOptionsWithDefaults.data, ...validWorkerOptions })
        },
        { scope: 'test', auto: true },
    ],
})

function schemaOptions<T extends zod.ZodObject<any>, S extends 'worker' | 'test'>(o: T, s: S) {
    return Object.fromEntries(
        Object.keys(o.shape).map(key => [key, [undefined, { scope: s, option: true }]])
    ) as unknown as { [k in keyof T]: [T[k], { scope: S; option: true }] }
}
