import { describe, expect, it } from 'vitest'

import {
    type AuthStatus,
    DOTCOM_URL,
    defaultAuthStatus,
    unauthenticatedStatus,
} from '@sourcegraph/cody-shared'
import { newAuthStatus } from './utils'

describe('validateAuthStatus', () => {
    const options: AuthStatus = {
        ...defaultAuthStatus,
        siteVersion: '',
        hasVerifiedEmail: true,
        siteHasCodyEnabled: true,
        authenticated: true,
        endpoint: DOTCOM_URL.toString(),
        userCanUpgrade: false,
        username: 'cody',
        primaryEmail: 'me@domain.test',
        displayName: 'Test Name',
        avatarURL: 'https://domain.test/avatar.png',
    }

    it('returns auth state for invalid user on dotcom instance', () => {
        const expected: AuthStatus = { ...unauthenticatedStatus, endpoint: options.endpoint }
        expect(
            newAuthStatus({
                ...options,
                authenticated: false,
                hasVerifiedEmail: false,
            })
        ).toEqual(expected)
    })

    it('returns auth status for valid user with verified email on dotcom instance', () => {
        const expected: AuthStatus = {
            ...options,
            authenticated: true,
            hasVerifiedEmail: true,
            showInvalidAccessTokenError: false,
            requiresVerifiedEmail: true,
            siteHasCodyEnabled: true,
            codyApiVersion: 1,
        }
        expect(newAuthStatus(options)).toEqual(expected)
    })

    it('returns auth status for valid user without verified email on dotcom instance', () => {
        const expected: AuthStatus = {
            ...options,
            authenticated: true,
            hasVerifiedEmail: false,
            requiresVerifiedEmail: true,
            siteHasCodyEnabled: true,
            codyApiVersion: 1,
        }
        expect(
            newAuthStatus({
                ...options,
                hasVerifiedEmail: false,
            })
        ).toEqual(expected)
    })

    it('returns auth status for valid user on enterprise instance with Cody enabled', () => {
        const expected: AuthStatus = {
            ...options,
            authenticated: true,
            siteHasCodyEnabled: true,
            hasVerifiedEmail: false,
            endpoint: 'https://example.com',
            codyApiVersion: 1,
        }
        expect(
            newAuthStatus({
                ...options,
                endpoint: 'https://example.com',
                hasVerifiedEmail: false,
            })
        ).toEqual(expected)
    })

    it('returns auth status for invalid user on enterprise instance with Cody enabled', () => {
        const expected: AuthStatus = { ...unauthenticatedStatus, endpoint: 'https://example.com' }
        expect(
            newAuthStatus({
                ...options,
                endpoint: 'https://example.com',
                authenticated: false,
                hasVerifiedEmail: false,
                siteHasCodyEnabled: false,
            })
        ).toEqual(expected)
    })

    it('returns auth status for valid user on enterprise instance with Cody disabled', () => {
        const expected: AuthStatus = {
            ...options,
            authenticated: true,
            siteHasCodyEnabled: false,
            hasVerifiedEmail: false,
            endpoint: 'https://example.com',
            codyApiVersion: 1,
        }
        expect(
            newAuthStatus({
                ...options,
                endpoint: 'https://example.com',
                siteHasCodyEnabled: false,
                hasVerifiedEmail: false,
            })
        ).toEqual(expected)
    })

    it('returns auth status for invalid user on enterprise instance with Cody disabled', () => {
        const expected: AuthStatus = { ...unauthenticatedStatus, endpoint: 'https://example.com' }
        expect(
            newAuthStatus({
                ...options,
                endpoint: 'https://example.com',
                authenticated: false,
                hasVerifiedEmail: false,
                siteHasCodyEnabled: false,
            })
        ).toEqual(expected)
    })

    it('returns auth status for signed in user without email and displayName on enterprise instance', () => {
        const expected: AuthStatus = {
            ...options,
            authenticated: true,
            siteHasCodyEnabled: true,
            endpoint: 'https://example.com',
            hasVerifiedEmail: false,
            codyApiVersion: 1,
        }
        expect(
            newAuthStatus({
                ...options,
                endpoint: 'https://example.com',
            })
        ).toEqual(expected)
    })

    it('returns API version 0 for a legacy instance', () => {
        const expected: AuthStatus = {
            ...options,
            authenticated: true,
            siteHasCodyEnabled: true,
            hasVerifiedEmail: false,
            codyApiVersion: 0,
            siteVersion: '5.2.0',
            endpoint: 'https://example.com',
        }
        expect(
            newAuthStatus({
                ...options,
                endpoint: 'https://example.com',
                siteVersion: '5.2.0',
            })
        ).toEqual(expected)
    })
})
