import { describe, expect, it } from 'vitest'

import { type AuthStatus, DOTCOM_URL } from '@sourcegraph/cody-shared'
import { newAuthStatus } from './utils'

describe('validateAuthStatus', () => {
    it('returns auth state for invalid user on dotcom instance', () => {
        expect(
            newAuthStatus({
                endpoint: DOTCOM_URL.toString(),
                authenticated: false,
            })
        ).toStrictEqual<AuthStatus>({
            endpoint: DOTCOM_URL.toString(),
            authenticated: false,
            showInvalidAccessTokenError: true,
        })
    })

    it('returns auth status for dotcom', () => {
        expect(
            newAuthStatus({
                authenticated: true,
                endpoint: DOTCOM_URL.toString(),
                primaryEmail: 'alice@example.com',
                hasVerifiedEmail: true,
                username: 'alice',
                siteVersion: '999',
            })
        ).toStrictEqual<AuthStatus>({
            endpoint: DOTCOM_URL.toString(),
            authenticated: true,
            username: 'alice',
            hasVerifiedEmail: true,
            requiresVerifiedEmail: true,
            codyApiVersion: 1,
            siteVersion: '999',
            isFireworksTracingEnabled: false,
            primaryEmail: 'alice@example.com',
        })
    })

    it('returns auth status for valid user on enterprise instance with Cody enabled', () => {
        expect(
            newAuthStatus({
                authenticated: true,
                endpoint: 'https://example.com',
                username: 'alice',
                siteVersion: '999',
            })
        ).toStrictEqual<AuthStatus>({
            authenticated: true,
            hasVerifiedEmail: false,
            endpoint: 'https://example.com',
            codyApiVersion: 1,
            isFireworksTracingEnabled: false,
            primaryEmail: undefined,
            requiresVerifiedEmail: false,
            siteVersion: '999',
            username: 'alice',
        })
    })

    it('returns auth status for invalid user on enterprise instance with Cody enabled', () => {
        expect(
            newAuthStatus({
                endpoint: 'https://example.com',
                authenticated: false,
            })
        ).toStrictEqual<AuthStatus>({
            authenticated: false,
            endpoint: 'https://example.com',
            showInvalidAccessTokenError: true,
        })
    })

    it('returns API version 0 for a legacy instance', () => {
        expect(
            newAuthStatus({
                authenticated: true,
                endpoint: 'https://example.com',
                siteVersion: '5.2.0',
                username: 'alice',
            })
        ).toStrictEqual<AuthStatus>({
            authenticated: true,
            endpoint: 'https://example.com',
            siteVersion: '5.2.0',
            hasVerifiedEmail: false,
            codyApiVersion: 0,
            username: 'alice',
            requiresVerifiedEmail: false,
            isFireworksTracingEnabled: false,
            primaryEmail: undefined,
        })
    })
})