import { describe, expect, it } from 'vitest'

import { version as packageVersion } from '../package.json'

import { majorMinorVersion, releaseNotesURL, releaseType, version } from './version'

describe('version', () => {
    it('returns the version from JSON', () => {
        expect(version).toEqual(packageVersion)
    })
})

describe('majorMinorVersion', () => {
    it('returns the first two components', () => {
        expect(majorMinorVersion('0.2.1')).toEqual('0.2')
        expect(majorMinorVersion('4.2.1')).toEqual('4.2')
        expect(majorMinorVersion('4.3.1689391131')).toEqual('4.3')
    })
})

describe('releaseType', () => {
    it('returns stable if no dash', () => {
        expect(releaseType('4.2.1')).toEqual('stable')
    })
    it('returns insiders if it is an odd minor version', () => {
        expect(releaseType('4.3.1689391131')).toEqual('insiders')
    })
})

describe('releaseNotesURL', () => {
    it('returns GitHub release notes for stable builds', () => {
        expect(releaseNotesURL('4.2.1')).toEqual('https://github.com/sourcegraph/cody/releases/tag/vscode-v4.2.1')
    })
    it('returns changelog for insiders builds', () => {
        expect(releaseNotesURL('4.3.1689391131')).toEqual(
            'https://github.com/sourcegraph/cody/blob/main/vscode/CHANGELOG.md'
        )
    })
})
