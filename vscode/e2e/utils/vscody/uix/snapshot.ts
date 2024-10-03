import fs from 'node:fs/promises'
import path from 'node:path'
import { type ExpectMatcherState, type MatcherReturnType, type TestInfo, test } from '@playwright/test'
import fse from 'fs-extra'
import { produce } from 'immer'
import _ from 'lodash'
import type { ArraySlice } from 'type-fest'
export { test } from '@playwright/test'

export const expect = {
    async toMatchJSONSnapshot<T extends object>(
        this: ExpectMatcherState,
        received: T,
        snapshotName: string,
        options?: {
            /**
             * Normalizers are applied in order and use immerjs to isolate changes from the original
             * If a array is passed, each element will be normalized individually.
             */
            normalizers?: ((obj: object) => any)[]
        }
    ): Promise<MatcherReturnType> {
        const name = 'toMatchJSONSnapshot'
        if (this.isNot) {
            throw new Error('not implemented')
        }

        const testInfo = test.info() as TestInfo & { _projectInternal: any }
        let normalized: any = received
        for (const normalizer of options?.normalizers ?? []) {
            normalized = _.isArray(normalized)
                ? normalized.map(v => produce(v, normalizer))
                : produce(normalized, normalizer)
        }
        const snapshotDir = testInfo.snapshotDir
        await fs.mkdir(snapshotDir, { recursive: true })
        const snapshotPath = path.join(snapshotDir, `${snapshotName}.snap.json`)
        const newSnapshotPath = path.join(snapshotDir, `${snapshotName}.new.json`)

        const currentJsonString = JSON.stringify(normalized, null, 2)
        const [previousJsonString, previousExists] = await fs
            .readFile(snapshotPath, 'utf-8')
            .then(v => [v, true] as const)
            .catch(() => [null, false] as const)

        if (
            testInfo.config.updateSnapshots === 'all' ||
            (testInfo.config.updateSnapshots === 'missing' && !previousExists)
        ) {
            await fs.writeFile(snapshotPath, currentJsonString)
            await fse.unlink(newSnapshotPath).catch(() => {}) // we don't care
            return {
                pass: true,
                message: () => 'Snapshot updated',
                name,
                expected: snapshotName,
            }
        }

        const previousJson = previousJsonString ? JSON.parse(previousJsonString) : null
        const currentJson = JSON.parse(currentJsonString)

        if (!_.isEqual(currentJson, previousJson)) {
            await fs.writeFile(newSnapshotPath, currentJsonString)
            return {
                pass: false,
                message: () =>
                    previousExists
                        ? `Snapshot (${snapshotPath}) does not match (${newSnapshotPath}):\n\n${this.utils.diff(
                              previousJson,
                              currentJson
                          )}`
                        : `New snapshot created (${newSnapshotPath}).\n\nChange the \`.new.json\` to \`.snap.json\` to accept the diff or run with \`updateSnapshots\` setting.\n\n${currentJsonString}`,
                name,
                expected: previousJson,
                actual: currentJson,
            }
        }

        await fse.unlink(newSnapshotPath).catch(() => {}) // we don't care

        return {
            message: () => 'Snapshot matches',
            pass: true,
        }
    },
} as const

export namespace Normalizers {
    export const pick =
        (...paths: string[]) =>
        (draft: any) => {
            return _.pick(draft, ...paths)
        }

    export const omit =
        (...paths: string[]) =>
        (draft: any) => {
            return _.omit(draft, ...paths)
        }

    export const blank =
        (...paths: string[]) =>
        (draft: any) => {
            for (const path of paths) {
                const value = _.get(draft, path)
                switch (typeof value) {
                    case 'string':
                        _.set(draft, path, value.length > 0 ? '<string>' : '<blank-string>')
                        break
                    case 'number':
                        _.set(draft, path, value > 0 ? 1 : value < 0 ? -1 : 0)
                        break
                    case 'object':
                        if (value === null || value === undefined) {
                            break
                        }
                        _.set(draft, path, '<Object>')
                        break
                }
            }
            return draft
        }

    export const fixedDates =
        (fixedDate = new Date('2000-01-01T00:00:00Z')) =>
        (draft: any) => {
            function recurse(current: any): any {
                if (current instanceof Date) {
                    return new Date(fixedDate)
                }

                if (Array.isArray(current)) {
                    return current.map(recurse)
                }

                if (typeof current === 'object' && current !== null) {
                    for (const key of Object.keys(current)) {
                        current[key] = recurse(current[key])
                    }
                }

                return current
            }
            return recurse(draft)
        }

    /**
     * Allows you to sort a specified path by an arbitrary key
     */
    export const sortPathBy = (
        path: string,
        ...args: ArraySlice<Parameters<(typeof _)['sortBy']>, 1>
    ) => {
        return (draft: any) => {
            const item = _.get(draft, path)
            if (_.isArray(item)) {
                const sorted = _.sortBy(item, ...args)
                _.set(draft, path, sorted)
                // item.splice(0, item.length, ...sorted)
            }
            return draft
        }
    }

    export function sortKeysDeep(obj: any) {
        return produce(obj, (draft: any) => {
            if (typeof draft !== 'object' || draft === null) {
                return
            }

            if (Array.isArray(draft)) {
                for (const [index, item] of draft.entries()) {
                    draft[index] = sortKeysDeep(item)
                }
                return
            }

            const sortedKeys = Object.keys(draft).sort()
            const newObj = {}

            for (const key of sortedKeys) {
                //@ts-ignore
                newObj[key] = sortKeysDeep(draft[key])
            }

            return newObj
        })
    }
}
