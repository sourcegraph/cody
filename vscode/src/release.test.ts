import { describe, expect, it } from 'vitest'

import { CodyIDE } from '@sourcegraph/cody-shared'
import { getReleaseNotesURLByIDE, getReleaseTypeByIDE, majorMinorVersion } from './release'

describe('majorMinorVersion', () => {
    it('returns the first two components', () => {
        expect(majorMinorVersion('0.2.1')).toEqual('0.2')
        expect(majorMinorVersion('4.2.1')).toEqual('4.2')
        expect(majorMinorVersion('4.3.1689391131')).toEqual('4.3')
    })
})

describe('getReleaseTypeByIDE', () => {
    it('returns insiders for VS Code versions with odd minor version', () => {
        expect(getReleaseTypeByIDE(CodyIDE.VSCode, '4.3.1')).toEqual('insiders')
        expect(getReleaseTypeByIDE(CodyIDE.VSCode, '4.5.0')).toEqual('insiders')
        expect(getReleaseTypeByIDE(CodyIDE.VSCode, '4.3.1689391131')).toEqual('insiders')
    })

    it('returns stable for VS Code versions with even minor version', () => {
        expect(getReleaseTypeByIDE(CodyIDE.VSCode, '4.2.1')).toEqual('stable')
        expect(getReleaseTypeByIDE(CodyIDE.VSCode, '4.4.0')).toEqual('stable')
    })

    it('returns insiders for JetBrains versions ending with -nightly', () => {
        expect(getReleaseTypeByIDE(CodyIDE.JetBrains, '2023.1.1-nightly')).toEqual('insiders')
        expect(getReleaseTypeByIDE(CodyIDE.JetBrains, '2023.2.0-nightly')).toEqual('insiders')
    })

    it('returns stable for JetBrains versions not ending with -nightly', () => {
        expect(getReleaseTypeByIDE(CodyIDE.JetBrains, '2023.1.1')).toEqual('stable')
        expect(getReleaseTypeByIDE(CodyIDE.JetBrains, '2023.2.0')).toEqual('stable')
    })

    it('throws an error for unsupported IDEs', () => {
        expect(() => getReleaseTypeByIDE('SublimeText' as CodyIDE, '4.0.0')).toThrowError(
            'IDE not supported'
        )
    })
})

describe('getReleaseNotesURLByIDE', () => {
    it('returns stable release blog post URL for VS Code stable builds', () => {
        expect(getReleaseNotesURLByIDE('1.24.0', CodyIDE.VSCode)).toEqual(
            'https://sourcegraph.com/blog/cody-vscode-1-24-0-release'
        )
    })

    it('returns stable release blog post URL for VS Code patch release', () => {
        expect(getReleaseNotesURLByIDE('1.24.2', CodyIDE.VSCode)).toEqual(
            'https://sourcegraph.com/blog/cody-vscode-1-24-0-release'
        )
    })

    it('returns stable release blog post URL for VS Code insiders builds', () => {
        expect(getReleaseNotesURLByIDE('1.25.1720624657', CodyIDE.VSCode)).toEqual(
            'https://sourcegraph.com/blog/cody-vscode-1-24-0-release'
        )
    })

    it('returns GitHub release notes for JetBrains stable builds', () => {
        expect(getReleaseNotesURLByIDE('5.5.10', CodyIDE.JetBrains)).toEqual(
            'https://github.com/sourcegraph/jetbrains/releases/tag/v5.5.10'
        )
    })

    it('returns GitHub release notes homepage for JetBrains nightly builds', () => {
        expect(getReleaseNotesURLByIDE('5.5.1-nightly', CodyIDE.JetBrains)).toEqual(
            'https://github.com/sourcegraph/jetbrains/releases'
        )
    })
})
