import { describe, expect, it } from 'vitest'

import { defaultAuthStatus, unauthenticatedStatus } from './protocol'
import { newAuthStatus } from './utils'

describe('validateAuthStatus', () => {
    const siteVersion = ''
    const isDotCom = true
    const verifiedEmail = true
    const codyEnabled = true
    const validUser = true
    const endpoint = ''
    const userCanUpgrade = false
    const username = 'cody'
    const primaryEmail = 'me@domain.test'
    const displayName = 'Test Name'
    const avatarURL = 'https://domain.test/avatar.png'

    it('returns auth state for invalid user on dotcom instance', () => {
        const expected = { ...unauthenticatedStatus, endpoint }
        expect(
            newAuthStatus(
                endpoint,
                isDotCom,
                !validUser,
                !verifiedEmail,
                codyEnabled,
                userCanUpgrade,
                siteVersion,
                avatarURL,
                username,
                displayName,
                primaryEmail
            )
        ).toEqual(expected)
    })

    it('returns auth status for valid user with verified email on dotcom instance', () => {
        const expected = {
            ...defaultAuthStatus,
            authenticated: true,
            hasVerifiedEmail: true,
            showInvalidAccessTokenError: false,
            requiresVerifiedEmail: true,
            siteHasCodyEnabled: true,
            isLoggedIn: true,
            endpoint,
            avatarURL,
            username,
            displayName,
            primaryEmail,
            codyApiVersion: 1,
        }
        expect(
            newAuthStatus(
                endpoint,
                isDotCom,
                validUser,
                verifiedEmail,
                codyEnabled,
                userCanUpgrade,
                siteVersion,
                avatarURL,
                username,
                displayName,
                primaryEmail
            )
        ).toEqual(expected)
    })

    it('returns auth status for valid user without verified email on dotcom instance', () => {
        const expected = {
            ...defaultAuthStatus,
            authenticated: true,
            hasVerifiedEmail: false,
            requiresVerifiedEmail: true,
            siteHasCodyEnabled: true,
            endpoint,
            avatarURL,
            username,
            displayName,
            primaryEmail,
            codyApiVersion: 1,
        }
        expect(
            newAuthStatus(
                endpoint,
                isDotCom,
                validUser,
                !verifiedEmail,
                codyEnabled,
                userCanUpgrade,
                siteVersion,
                avatarURL,
                username,
                displayName,
                primaryEmail
            )
        ).toEqual(expected)
    })

    it('returns auth status for valid user on enterprise instance with Cody enabled', () => {
        const expected = {
            ...defaultAuthStatus,
            authenticated: true,
            siteHasCodyEnabled: true,
            isLoggedIn: true,
            isDotCom: false,
            endpoint,
            avatarURL,
            username,
            displayName,
            primaryEmail,
            codyApiVersion: 1,
        }
        expect(
            newAuthStatus(
                endpoint,
                !isDotCom,
                validUser,
                verifiedEmail,
                codyEnabled,
                userCanUpgrade,
                siteVersion,
                avatarURL,
                username,
                displayName,
                primaryEmail
            )
        ).toEqual(expected)
    })

    it('returns auth status for invalid user on enterprise instance with Cody enabled', () => {
        const expected = { ...unauthenticatedStatus, endpoint }
        expect(
            newAuthStatus(
                endpoint,
                !isDotCom,
                !validUser,
                verifiedEmail,
                codyEnabled,
                userCanUpgrade,
                siteVersion,
                avatarURL,
                primaryEmail,
                displayName
            )
        ).toEqual(expected)
    })

    it('returns auth status for valid user on enterprise instance with Cody disabled', () => {
        const expected = {
            ...defaultAuthStatus,
            authenticated: true,
            siteHasCodyEnabled: false,
            endpoint,
            avatarURL,
            username,
            displayName,
            primaryEmail,
            isDotCom: false,
            codyApiVersion: 1,
        }
        expect(
            newAuthStatus(
                endpoint,
                !isDotCom,
                validUser,
                !verifiedEmail,
                !codyEnabled,
                userCanUpgrade,
                siteVersion,
                avatarURL,
                username,
                displayName,
                primaryEmail
            )
        ).toEqual(expected)
    })

    it('returns auth status for invalid user on enterprise instance with Cody disabled', () => {
        const expected = { ...unauthenticatedStatus, endpoint }
        expect(
            newAuthStatus(
                endpoint,
                !isDotCom,
                !validUser,
                verifiedEmail,
                !codyEnabled,
                userCanUpgrade,
                siteVersion,
                avatarURL,
                username,
                displayName,
                primaryEmail
            )
        ).toEqual(expected)
    })

    it('returns auth status for signed in user without email and displayName on enterprise instance', () => {
        const expected = {
            ...defaultAuthStatus,
            authenticated: true,
            siteHasCodyEnabled: true,
            isLoggedIn: true,
            isDotCom: false,
            endpoint,
            avatarURL,
            username,
            displayName: '',
            primaryEmail: '',
            codyApiVersion: 1,
        }
        expect(
            newAuthStatus(
                endpoint,
                !isDotCom,
                validUser,
                verifiedEmail,
                codyEnabled,
                userCanUpgrade,
                siteVersion,
                avatarURL,
                username
            )
        ).toEqual(expected)
    })

    it('returns API version 0 for a legacy instance', () => {
        const expected = {
            ...defaultAuthStatus,
            authenticated: true,
            siteHasCodyEnabled: true,
            isLoggedIn: true,
            isDotCom: false,
            endpoint,
            avatarURL,
            username,
            displayName: '',
            primaryEmail: '',
            siteVersion: '5.2.0',
            codyApiVersion: 0,
        }
        expect(
            newAuthStatus(
                endpoint,
                !isDotCom,
                validUser,
                verifiedEmail,
                codyEnabled,
                userCanUpgrade,
                '5.2.0',
                avatarURL,
                username
            )
        ).toEqual(expected)
    })
})
