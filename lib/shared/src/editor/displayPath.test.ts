import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { URI } from 'vscode-uri'

import { isWindows } from '../common/platform'

import {
    type DisplayPathEnvInfo,
    displayPath,
    displayPathBasename,
    displayPathDirname,
    setDisplayPathEnvInfo,
    uriHasPrefix,
} from './displayPath'

const DISPLAY_PATH_TEST_CASES: {
    name: string
    tests: Partial<
        Record<
            'nonWindows' | 'windows' | 'all',
            { envInfo: Omit<DisplayPathEnvInfo, 'isWindows'>; cases: { input: URI; expected: string }[] }
        >
    >
}[] = [
    {
        name: 'no workspace folders',
        tests: {
            nonWindows: {
                envInfo: { workspaceFolders: [] },
                cases: [
                    { input: URI.file('/foo/bar.ts'), expected: '/foo/bar.ts' },
                    {
                        input: URI.parse('https://example.com/foo/bar.ts'),
                        expected: 'https://example.com/foo/bar.ts',
                    },
                ],
            },
            windows: {
                envInfo: { workspaceFolders: [] },
                cases: [
                    { input: windowsFileURI('c:\\foo\\bar.ts'), expected: 'c:\\foo\\bar.ts' },
                    {
                        input: URI.parse('https://example.com/foo/bar.ts'),
                        expected: 'https://example.com/foo/bar.ts',
                    },
                ],
            },
        },
    },
    {
        name: '1 workspace folder',
        tests: {
            nonWindows: {
                envInfo: { workspaceFolders: [URI.file('/workspace')] },
                cases: [
                    { input: URI.file('/workspace/foo/bar.ts'), expected: 'foo/bar.ts' },
                    { input: URI.file('/other/foo/bar.ts'), expected: '/other/foo/bar.ts' },
                    {
                        input: URI.parse('https://example.com/foo/bar.ts'),
                        expected: 'https://example.com/foo/bar.ts',
                    },
                ],
            },
            windows: {
                envInfo: { workspaceFolders: [windowsFileURI('c:\\workspace')] },
                cases: [
                    { input: windowsFileURI('c:\\workspace\\foo\\bar.ts'), expected: 'foo\\bar.ts' },
                    {
                        input: windowsFileURI('c:\\other\\foo\\bar.ts'),
                        expected: 'c:\\other\\foo\\bar.ts',
                    },
                    {
                        input: URI.parse('https://example.com/foo/bar.ts'),
                        expected: 'https://example.com/foo/bar.ts',
                    },
                ],
            },
        },
    },
    {
        name: 'root workspace folder',
        tests: {
            nonWindows: {
                envInfo: { workspaceFolders: [URI.file('/')] },
                cases: [{ input: URI.file('/foo/bar.ts'), expected: 'foo/bar.ts' }],
            },
            windows: {
                envInfo: { workspaceFolders: [windowsFileURI('c:\\')] },
                cases: [{ input: windowsFileURI('c:\\foo\\bar.ts'), expected: 'foo\\bar.ts' }],
            },
        },
    },
    {
        name: '2 workspace folders',
        tests: {
            nonWindows: {
                envInfo: {
                    workspaceFolders: [URI.file('/workspace1'), URI.file('/workspace2')],
                },
                cases: [
                    { input: URI.file('/workspace1/foo/bar.ts'), expected: 'workspace1/foo/bar.ts' },
                    { input: URI.file('/workspace2/foo/bar.ts'), expected: 'workspace2/foo/bar.ts' },
                    { input: URI.file('/other/foo/bar.ts'), expected: '/other/foo/bar.ts' },
                    {
                        input: URI.parse('https://example.com/foo/bar.ts'),
                        expected: 'https://example.com/foo/bar.ts',
                    },
                ],
            },
            windows: {
                envInfo: {
                    workspaceFolders: [
                        windowsFileURI('c:\\workspace1'),
                        windowsFileURI('c:\\workspace2'),
                    ],
                },
                cases: [
                    {
                        input: windowsFileURI('c:\\workspace1\\foo\\bar.ts'),
                        expected: 'workspace1\\foo\\bar.ts',
                    },
                    {
                        input: windowsFileURI('c:\\workspace2\\foo\\bar.ts'),
                        expected: 'workspace2\\foo\\bar.ts',
                    },
                    {
                        input: windowsFileURI('c:\\other\\foo\\bar.ts'),
                        expected: 'c:\\other\\foo\\bar.ts',
                    },
                    {
                        input: URI.parse('https://example.com/foo/bar.ts'),
                        expected: 'https://example.com/foo/bar.ts',
                    },
                ],
            },
        },
    },
    {
        name: 'non-file scheme',
        tests: {
            all: {
                envInfo: { workspaceFolders: [URI.parse('https://example.com/a')] },
                cases: [
                    { input: URI.parse('https://example.com/a/b/c.ts'), expected: 'b/c.ts' },
                    {
                        input: URI.parse('https://example.com/foo/bar.ts'),
                        expected: 'https://example.com/foo/bar.ts',
                    },
                ],
            },
        },
    },
]

/** Mimics the behavior of {@link URI.file} on Windows, regardless of the current platform. */
function windowsFileURI(fsPath: string): URI {
    return URI.file(fsPath.replaceAll('\\', '/'))
}

function withEnvInfo<T>(envInfo: DisplayPathEnvInfo, fn: () => T): T {
    const prev = setDisplayPathEnvInfo(envInfo)
    try {
        return fn()
    } finally {
        setDisplayPathEnvInfo(prev as any)
    }
}

describe('displayPath', () => {
    function displayPathWithEnvInfo(location: URI, envInfo: DisplayPathEnvInfo): string {
        return withEnvInfo(envInfo, () => displayPath(location))
    }

    for (const {
        name,
        tests: { nonWindows, windows, all },
    } of DISPLAY_PATH_TEST_CASES) {
        function runTestCases(envInfo: DisplayPathEnvInfo, cases: { input: URI; expected: string }[]) {
            test(name, () => {
                for (const { input, expected } of cases) {
                    expect(displayPathWithEnvInfo(input, envInfo)).toBe(expected)
                }
            })
        }
        if (nonWindows) {
            // Don't run non-Windows tests on Windows because our compat layer isn't set up to
            // handle that (we only handle some partial emulation of Windows on non-Windows).
            describe.skipIf(isWindows())('nonWindows', () =>
                runTestCases({ ...nonWindows.envInfo, isWindows: false }, nonWindows.cases)
            )
        }
        if (windows) {
            describe('windows', () =>
                runTestCases({ ...windows.envInfo, isWindows: true }, windows.cases))
        }
        if (all) {
            describe.skipIf(isWindows())('all nonWindows', () =>
                runTestCases({ ...all.envInfo, isWindows: false }, all.cases)
            )
            describe('all windows', () => runTestCases({ ...all.envInfo, isWindows: true }, all.cases))
        }
    }
})

describe('displayPathDirname', () => {
    function displayPathDirnameWithEnvInfo(location: URI, envInfo: DisplayPathEnvInfo): string {
        return withEnvInfo(envInfo, () => displayPathDirname(location))
    }

    describe('nonWindows', () => {
        test('no workspace folders', () => {
            const envInfo: DisplayPathEnvInfo = { isWindows: false, workspaceFolders: [] }
            if (!isWindows()) {
                // Skip on Windows because there is still some magic in the URI library for file: URIs
                // on Windows.
                expect(displayPathDirnameWithEnvInfo(URI.parse('file:///foo/bar.ts'), envInfo)).toBe(
                    '/foo'
                )
            }
            expect(
                displayPathDirnameWithEnvInfo(URI.parse('https://example.com/foo/bar.ts'), envInfo)
            ).toBe('https://example.com/foo')
        })

        test('1 workspace folder', () => {
            const envInfo: DisplayPathEnvInfo = {
                isWindows: false,
                workspaceFolders: [URI.parse('file:///workspace')],
            }
            if (!isWindows()) {
                // Skip on Windows because there is still some magic in the URI library for file: URIs
                // on Windows.
                expect(
                    displayPathDirnameWithEnvInfo(URI.parse('file:///workspace/foo.ts'), envInfo)
                ).toBe('.')
                expect(
                    displayPathDirnameWithEnvInfo(URI.parse('file:///workspace/foo/bar.ts'), envInfo)
                ).toBe('foo')
                expect(displayPathDirnameWithEnvInfo(URI.parse('file:///other/foo.ts'), envInfo)).toBe(
                    '/other'
                )
            }
            expect(displayPathDirnameWithEnvInfo(URI.parse('https://example.com/a/b'), envInfo)).toBe(
                'https://example.com/a'
            )
        })

        test('2 workspace folders', () => {
            const envInfo: DisplayPathEnvInfo = {
                isWindows: false,
                workspaceFolders: [URI.parse('file:///workspace1'), URI.parse('file:///workspace2')],
            }
            if (!isWindows()) {
                // Skip on Windows because there is still some magic in the URI library for file: URIs
                // on Windows.
                expect(
                    displayPathDirnameWithEnvInfo(URI.parse('file:///workspace1/foo.ts'), envInfo)
                ).toBe('workspace1')
                expect(
                    displayPathDirnameWithEnvInfo(URI.parse('file:///workspace2/foo.ts'), envInfo)
                ).toBe('workspace2')
                expect(
                    displayPathDirnameWithEnvInfo(URI.parse('file:///workspace1/foo/bar.ts'), envInfo)
                ).toBe('workspace1/foo')
                expect(
                    displayPathDirnameWithEnvInfo(URI.parse('file:///workspace2/foo/bar.ts'), envInfo)
                ).toBe('workspace2/foo')
                expect(displayPathDirnameWithEnvInfo(URI.parse('file:///other/foo.ts'), envInfo)).toBe(
                    '/other'
                )
            }
            expect(displayPathDirnameWithEnvInfo(URI.parse('https://example.com/a/b'), envInfo)).toBe(
                'https://example.com/a'
            )
        })
    })

    describe('windows', () => {
        test('no workspace folders', () => {
            const envInfo: DisplayPathEnvInfo = { isWindows: true, workspaceFolders: [] }
            expect(displayPathDirnameWithEnvInfo(windowsFileURI('C:\\foo\\bar.ts'), envInfo)).toBe(
                'c:\\foo'
            )
        })

        test('1 workspace folder', () => {
            const envInfo: DisplayPathEnvInfo = {
                isWindows: true,
                workspaceFolders: [windowsFileURI('c:\\workspace')],
            }
            expect(displayPathDirnameWithEnvInfo(windowsFileURI('C:\\workspace\\foo.ts'), envInfo)).toBe(
                '.'
            )
            expect(
                displayPathDirnameWithEnvInfo(windowsFileURI('C:\\workspace\\foo\\bar.ts'), envInfo)
            ).toBe('foo')
            expect(displayPathDirnameWithEnvInfo(windowsFileURI('C:\\other\\foo.ts'), envInfo)).toBe(
                'c:\\other'
            )
            expect(displayPathDirnameWithEnvInfo(URI.parse('https://example.com/a/b'), envInfo)).toBe(
                'https://example.com/a'
            )
        })

        test('2 workspace folders', () => {
            const envInfo: DisplayPathEnvInfo = {
                isWindows: true,
                workspaceFolders: [windowsFileURI('c:\\workspace1'), windowsFileURI('c:\\workspace2')],
            }
            expect(
                displayPathDirnameWithEnvInfo(windowsFileURI('C:\\workspace1\\foo.ts'), envInfo)
            ).toBe('workspace1')
            expect(
                displayPathDirnameWithEnvInfo(windowsFileURI('C:\\workspace2\\foo.ts'), envInfo)
            ).toBe('workspace2')
            expect(
                displayPathDirnameWithEnvInfo(windowsFileURI('C:\\workspace1\\foo\\bar.ts'), envInfo)
            ).toBe('workspace1\\foo')
            expect(
                displayPathDirnameWithEnvInfo(windowsFileURI('C:\\workspace2\\foo\\bar.ts'), envInfo)
            ).toBe('workspace2\\foo')
            expect(displayPathDirnameWithEnvInfo(windowsFileURI('C:\\other\\foo.ts'), envInfo)).toBe(
                'c:\\other'
            )
            expect(displayPathDirnameWithEnvInfo(URI.parse('https://example.com/a/b'), envInfo)).toBe(
                'https://example.com/a'
            )
        })
    })
})

describe('displayPathBasename', () => {
    function displayPathBasenameWithEnvInfo(location: URI, envInfo: DisplayPathEnvInfo): string {
        return withEnvInfo(envInfo, () => displayPathBasename(location))
    }

    // Workspace folders don't make a difference for basename since we're just looking at
    // the last path component, so these tests can be simpler than for the other
    // displayPath functions.

    test('nonWindows', () => {
        const envInfo: DisplayPathEnvInfo = { isWindows: false, workspaceFolders: [] }
        if (!isWindows()) {
            // Skip on Windows because there is still some magic in the URI library for file: URIs
            // on Windows.
            expect(displayPathBasenameWithEnvInfo(URI.parse('file:///foo/bar.ts'), envInfo)).toBe(
                'bar.ts'
            )
        }
        expect(displayPathBasenameWithEnvInfo(URI.parse('https://example.com/a/b'), envInfo)).toBe('b')
    })

    test('windows', () => {
        const envInfo: DisplayPathEnvInfo = { isWindows: true, workspaceFolders: [] }
        expect(displayPathBasenameWithEnvInfo(windowsFileURI('C:\\foo\\bar.ts'), envInfo)).toBe('bar.ts')
        expect(displayPathBasenameWithEnvInfo(URI.parse('https://example.com/a/b'), envInfo)).toBe('b')
    })
})

describe('uriHasPrefix', () => {
    test('same url', () =>
        expect(
            uriHasPrefix(
                URI.parse('https://example.com/a/b'),
                URI.parse('https://example.com/a/b'),
                false
            )
        ).toBe(true))

    test('https path prefix', () => {
        expect(
            uriHasPrefix(URI.parse('https://example.com/a/b'), URI.parse('https://example.com/a'), false)
        ).toBe(true)
        expect(
            uriHasPrefix(URI.parse('https://example.com/a/b'), URI.parse('other://example.com/a'), false)
        ).toBe(false)
        expect(
            uriHasPrefix(
                URI.parse('https://example.com/a/b'),
                URI.parse('https://example.com/a/'),
                false
            )
        ).toBe(true)
        expect(
            uriHasPrefix(URI.parse('https://example.com/a'), URI.parse('https://example.com/a/'), false)
        ).toBe(true)
        expect(
            uriHasPrefix(URI.parse('https://example.com/a-b'), URI.parse('https://example.com/a'), false)
        ).toBe(false)
    })

    test('file path prefix', () => {
        expect(uriHasPrefix(URI.parse('file:///a/b'), URI.parse('file:///a'), false)).toBe(true)
        expect(uriHasPrefix(URI.parse('file:///a/b'), URI.parse('file:///A'), false)).toBe(false)
        expect(uriHasPrefix(URI.parse('file:///a/b'), URI.parse('file:///b'), false)).toBe(false)
        expect(uriHasPrefix(URI.parse('file:///c:/a/b'), URI.parse('file:///c:/a'), true)).toBe(true)
        expect(uriHasPrefix(URI.parse('file:///c:/a/b'), URI.parse('file:///C:/a'), true)).toBe(true)
        expect(uriHasPrefix(URI.parse('file:///c:/a/b'), URI.parse('file:///c:/A'), true)).toBe(false)
        expect(uriHasPrefix(URI.parse('file:///c:/a/b'), URI.parse('file:///c:/b'), true)).toBe(false)
    })
})

describe('setDisplayPathEnvInfo', () => {
    let orig: Parameters<typeof setDisplayPathEnvInfo>[0]
    beforeEach(() => {
        orig = setDisplayPathEnvInfo(null)
    })
    afterEach(() => {
        setDisplayPathEnvInfo(orig)
    })
    test('throws if no env info is set', () => {
        expect(() => {
            displayPath(URI.parse('file:///a/b.ts'))
        }).toThrowError('no environment info for displayPath')
    })
})
