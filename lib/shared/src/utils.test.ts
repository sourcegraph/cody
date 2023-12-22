import { describe, expect, test } from 'vitest'

import { convertGitCloneURLToCodebaseName, convertGitCloneURLToCodebaseNameOrError, isError } from './utils'

describe('convertGitCloneURLToCodebaseName', () => {
    test('converst Azure DevOps URL', () => {
        expect(convertGitCloneURLToCodebaseName('https://dev.azure.com/organization/project/_git/repository')).toEqual(
            'dev.azure.com/organization/project/repository'
        )
    })

    test('converts GitHub SSH URL', () => {
        expect(convertGitCloneURLToCodebaseName('git@github.com:sourcegraph/sourcegraph.git')).toEqual(
            'github.com/sourcegraph/sourcegraph'
        )
    })

    test('converts GitHub SSH URL with different user', () => {
        expect(convertGitCloneURLToCodebaseName('jdsbcnuqwew@github.com:sourcegraph/sourcegraph.git')).toEqual(
            'github.com/sourcegraph/sourcegraph'
        )
    })

    test('converts GitHub SSH URL with the port number', () => {
        expect(convertGitCloneURLToCodebaseName('ssh://git@gitlab-my-company.net:20022/path/repo.git')).toEqual(
            'gitlab-my-company.net/path/repo'
        )
    })

    test('converts GitHub SSH URL no trailing .git', () => {
        expect(convertGitCloneURLToCodebaseName('git@github.com:sourcegraph/sourcegraph')).toEqual(
            'github.com/sourcegraph/sourcegraph'
        )
    })

    test('converts GitHub HTTPS URL', () => {
        expect(convertGitCloneURLToCodebaseName('https://github.com/sourcegraph/sourcegraph')).toEqual(
            'github.com/sourcegraph/sourcegraph'
        )
    })

    test('converts Bitbucket HTTPS URL', () => {
        expect(convertGitCloneURLToCodebaseName('https://username@bitbucket.org/sourcegraph/sourcegraph.git')).toEqual(
            'bitbucket.org/sourcegraph/sourcegraph'
        )
    })

    test('converts Bitbucket SSH URL', () => {
        expect(convertGitCloneURLToCodebaseName('git@bitbucket.sgdev.org:sourcegraph/sourcegraph.git')).toEqual(
            'bitbucket.sgdev.org/sourcegraph/sourcegraph'
        )
    })

    test('converts GitLab SSH URL', () => {
        expect(convertGitCloneURLToCodebaseName('git@gitlab.com:sourcegraph/sourcegraph.git')).toEqual(
            'gitlab.com/sourcegraph/sourcegraph'
        )
    })

    test('converts GitLab HTTPS URL', () => {
        expect(convertGitCloneURLToCodebaseName('https://gitlab.com/sourcegraph/sourcegraph.git')).toEqual(
            'gitlab.com/sourcegraph/sourcegraph'
        )
    })

    test('converts GitHub SSH URL with Git', () => {
        expect(convertGitCloneURLToCodebaseName('git@github.com:sourcegraph/sourcegraph.git')).toEqual(
            'github.com/sourcegraph/sourcegraph'
        )
    })

    test('converts Eriks SSH Alias URL', () => {
        expect(convertGitCloneURLToCodebaseName('github:sourcegraph/sourcegraph')).toEqual(
            'github.com/sourcegraph/sourcegraph'
        )
    })

    test('converts HTTP URL', () => {
        expect(convertGitCloneURLToCodebaseName('http://github.com/sourcegraph/sourcegraph')).toEqual(
            'github.com/sourcegraph/sourcegraph'
        )
    })

    test('returns null for invalid URL', () => {
        expect(isError(convertGitCloneURLToCodebaseNameOrError('invalid'))).toBe(true)
    })
})
