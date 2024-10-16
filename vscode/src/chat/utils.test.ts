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
            pendingValidation: false,
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
                organizations: { nodes: [{ id: 'x', name: 'foo' }] },
            })
        ).toStrictEqual<AuthStatus>({
            endpoint: DOTCOM_URL.toString(),
            authenticated: true,
            username: 'alice',
            hasVerifiedEmail: true,
            requiresVerifiedEmail: true,
            isFireworksTracingEnabled: false,
            pendingValidation: false,
            primaryEmail: 'alice@example.com',
            organizations: [{ id: 'x', name: 'foo' }],
        })
    })

    it('returns auth status for valid user on enterprise instance with Cody enabled', () => {
        expect(
            newAuthStatus({
                authenticated: true,
                endpoint: 'https://example.com',
                username: 'alice',
            })
        ).toStrictEqual<AuthStatus>({
            authenticated: true,
            hasVerifiedEmail: false,
            endpoint: 'https://example.com',
            isFireworksTracingEnabled: false,
            primaryEmail: undefined,
            requiresVerifiedEmail: false,
            pendingValidation: false,
            username: 'alice',
            organizations: undefined,
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
            pendingValidation: false,
            showInvalidAccessTokenError: true,
        })
    })
})
