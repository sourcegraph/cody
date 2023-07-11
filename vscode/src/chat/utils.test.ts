import { describe, expect } from 'vitest'

import { defaultAuthStatus, unauthenticatedStatus } from './protocol'
import { newAuthStatus } from './utils'

describe('validateAuthStatus', () => {
    // NOTE: Site version is for frontend use and doesn't play a role in validating auth status
    const siteVersion = ''
    const isDotComOrApp = true
    const verifiedEmail = true
    const codyEnabled = true
    const validUser = true
    const endpoint = 'https://example.com'
    // DOTCOM AND APP USERS
    test('returns auth state for invalid user on dotcom or app instance', () => {
        const expected = { ...unauthenticatedStatus, endpoint }
        expect(newAuthStatus(endpoint, isDotComOrApp, !validUser, !verifiedEmail, codyEnabled, siteVersion)).toEqual(
            expected
        )
    })

    test('returns auth status for valid user with varified email on dotcom or app instance', () => {
        const expected = {
            ...defaultAuthStatus,
            authenticated: true,
            hasVerifiedEmail: true,
            showInvalidAccessTokenError: false,
            requiresVerifiedEmail: true,
            siteHasCodyEnabled: true,
            isLoggedIn: true,
            endpoint,
        }
        expect(newAuthStatus(endpoint, isDotComOrApp, validUser, verifiedEmail, codyEnabled, siteVersion)).toEqual(
            expected
        )
    })

    test('returns auth status for valid user without verified email on dotcom or app instance', () => {
        const expected = {
            ...defaultAuthStatus,
            authenticated: true,
            hasVerifiedEmail: false,
            requiresVerifiedEmail: true,
            siteHasCodyEnabled: true,
            endpoint,
        }
        expect(newAuthStatus(endpoint, isDotComOrApp, validUser, !verifiedEmail, codyEnabled, siteVersion)).toEqual(
            expected
        )
    })

    // ENTERPRISE
    test('returns auth status for valid user on enterprise instance with Cody enabled', () => {
        const expected = {
            ...defaultAuthStatus,
            authenticated: true,
            siteHasCodyEnabled: true,
            isLoggedIn: true,
            endpoint,
        }
        expect(newAuthStatus(endpoint, !isDotComOrApp, validUser, verifiedEmail, codyEnabled, siteVersion)).toEqual(
            expected
        )
    })

    test('returns auth status for invalid user on enterprise instance with Cody enabled', () => {
        const expected = { ...unauthenticatedStatus, endpoint }
        expect(newAuthStatus(endpoint, !isDotComOrApp, !validUser, verifiedEmail, codyEnabled, siteVersion)).toEqual(
            expected
        )
    })

    test('returns auth status for valid user on enterprise instance with Cody disabled', () => {
        const expected = {
            ...defaultAuthStatus,
            authenticated: true,
            siteHasCodyEnabled: false,
            endpoint,
        }
        expect(newAuthStatus(endpoint, !isDotComOrApp, validUser, !verifiedEmail, !codyEnabled, siteVersion)).toEqual(
            expected
        )
    })

    test('returns auth status for invalid user on enterprise instance with Cody disabled', () => {
        const expected = { ...unauthenticatedStatus, endpoint }
        expect(newAuthStatus(endpoint, !isDotComOrApp, !validUser, verifiedEmail, !codyEnabled, siteVersion)).toEqual(
            expected
        )
    })
})
