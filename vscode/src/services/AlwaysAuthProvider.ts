import * as vscode from 'vscode'

import { ConfigurationWithAccessToken } from '@sourcegraph/cody-shared/src/configuration'
import {
    AuthStatus
} from '../chat/protocol'
import { newAuthStatus } from '../chat/utils'
import { logDebug } from '../log'
import { localStorage } from './LocalStorageProvider'
import { secretStorage } from './SecretStorageProvider'
import { AuthProvider } from './AuthProvider'

export class AlwaysAuthProvider extends  AuthProvider { 

    // Sign into the last endpoint the user was signed into
    // if none, try signing in with App URL
    public async init(): Promise<void> {
        await this.appDetector.init()
        const lastEndpoint = localStorage?.getEndpoint() || this.config.serverEndpoint
        const token = (await secretStorage.get(lastEndpoint || '')) || this.config.accessToken
        logDebug('AuthProvider:init:lastEndpoint', lastEndpoint)
        await this.auth(lastEndpoint, token || null)
    }

    // Display quickpick to select endpoint to sign in to
    public async signinMenu(type?: 'enterprise' | 'dotcom' | 'token' | 'app', uri?: string): Promise<void> {
        await this.appAuth(uri)
    } 

    // Create Auth Status
    protected async _makeAuthStatus(
        config: Pick<ConfigurationWithAccessToken, 'serverEndpoint' | 'accessToken' | 'customHeaders'>
    ): Promise<AuthStatus> {
        const endpoint = config.serverEndpoint 
        return newAuthStatus(
            endpoint,
            false,
            true,
            true,
            true,
            /* userCanUpgrade: */ false,
            "1.0",
            undefined
        )
    }

    // It processes the authentication steps and stores the login info before sharing the auth status with chatview
    public async auth(
        uri: string,
        token: string | null,
        customHeaders?: {} | null
    ): Promise<{ authStatus: AuthStatus; isLoggedIn: boolean } | null> {
        const endpoint = formatURL(uri) || ''
        const config = {
            serverEndpoint: endpoint,
            accessToken: token,
            customHeaders: customHeaders || this.config.customHeaders,
        }
        const authStatus = await this._makeAuthStatus(config)
        const isLoggedIn = true
        authStatus.isLoggedIn = isLoggedIn
        await this.storeAuthInfo(endpoint, token)
        await this.syncAuthStatus(authStatus)
        await vscode.commands.executeCommand('setContext', 'cody.activated', isLoggedIn)
        return { authStatus, isLoggedIn }
    }

}

function formatURL(uri: string): string | null {
    if (!uri) {
        return null
    }
    // Check if the URI is in the correct URL format
    // Add missing https:// if needed
    if (!uri.startsWith('http')) {
        uri = `https://${uri}`
    }
    try {
        const endpointUri = new URL(uri)
        return endpointUri.href
    } catch {
        console.error('Invalid URL')
    }
    return null
}