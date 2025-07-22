/**
 * OAuth 2.0 Device Authorization Flow (RFC 8628) implementation for Sourcegraph.
 */

import * as vscode from 'vscode'

// OIDC Discovery endpoint response
export interface OIDCConfiguration {
    issuer: string
    authorization_endpoint: string
    token_endpoint: string
    device_authorization_endpoint?: string
    userinfo_endpoint: string
    jwks_uri: string
    scopes_supported: string[]
    response_types_supported: string[]
    grant_types_supported: string[]
    subject_types_supported: string[]
    id_token_signing_alg_values_supported: string[]
}

// Device authorization request response
export interface DeviceAuthorizationResponse {
    device_code: string
    user_code: string
    verification_uri: string
    verification_uri_complete?: string
    expires_in: number
    interval: number
}

// Token endpoint response
export interface TokenResponse {
    access_token: string
    token_type: string
    expires_in: number
    refresh_token?: string
    scope?: string
}

// Token error response
export interface TokenErrorResponse {
    error: 'authorization_pending' | 'slow_down' | 'access_denied' | 'expired_token'
    error_description?: string
}

export class OAuthDeviceFlow {
    private readonly httpClient: typeof fetch

    constructor(httpClient: typeof fetch = fetch) {
        this.httpClient = httpClient
    }

    /**
     * Check if Sourcegraph instance supports OAuth 2.0 device flow
     */
    async checkOIDCSupport(baseUrl: string): Promise<OIDCConfiguration | null> {
        try {
            const discoveryUrl = `${baseUrl}/.well-known/openid-configuration`
            const response = await this.httpClient(discoveryUrl)

            if (!response.ok) {
                return null
            }

            const config: OIDCConfiguration = await response.json()

            // Check if device authorization is supported
            if (!config.device_authorization_endpoint) {
                return null
            }

            return config
        } catch (error) {
            console.log('OIDC discovery failed:', error)
            return null
        }
    }

    /**
     * Start device authorization flow
     */
    async requestDeviceAuthorization(
        deviceEndpoint: string,
        clientId = 'cody-vscode',
        scopes: string[] = ['read:repositories', 'cody:*']
    ): Promise<DeviceAuthorizationResponse> {
        const params = new URLSearchParams({
            client_id: clientId,
            scope: scopes.join(' '),
        })

        const response = await this.httpClient(deviceEndpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                Accept: 'application/json',
            },
            body: params.toString(),
        })

        if (!response.ok) {
            throw new Error(`Device authorization failed: ${response.status} ${response.statusText}`)
        }

        return await response.json()
    }

    /**
     * Poll token endpoint until authorization is complete
     */
    async pollForToken(
        tokenEndpoint: string,
        deviceCode: string,
        clientId = 'cody-vscode',
        interval = 5
    ): Promise<TokenResponse> {
        const params = new URLSearchParams({
            grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
            device_code: deviceCode,
            client_id: clientId,
        })

        while (true) {
            try {
                const response = await this.httpClient(tokenEndpoint, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        Accept: 'application/json',
                    },
                    body: params.toString(),
                })

                if (response.ok) {
                    return await response.json()
                }

                const errorResponse: TokenErrorResponse = await response.json()

                switch (errorResponse.error) {
                    case 'authorization_pending':
                        // Continue polling
                        break
                    case 'slow_down':
                        // Increase polling interval
                        interval += 5
                        break
                    case 'access_denied':
                        throw new Error('User denied the authorization request')
                    case 'expired_token':
                        throw new Error('Device code has expired')
                    default:
                        throw new Error(`Token request failed: ${errorResponse.error}`)
                }
            } catch (error) {
                if (error instanceof Error) {
                    throw error
                }
                throw new Error('Token polling failed')
            }

            // Wait before next poll
            await new Promise(resolve => setTimeout(resolve, interval * 1000))
        }
    }

    /**
     * Refresh access token using refresh token
     */
    async refreshToken(
        tokenEndpoint: string,
        refreshToken: string,
        clientId = 'cody-vscode'
    ): Promise<TokenResponse> {
        const params = new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
            client_id: clientId,
        })

        const response = await this.httpClient(tokenEndpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                Accept: 'application/json',
            },
            body: params.toString(),
        })

        if (!response.ok) {
            throw new Error(`Token refresh failed: ${response.status} ${response.statusText}`)
        }

        return await response.json()
    }
}

/**
 * Main OAuth device flow orchestrator
 */
export class DeviceFlowAuthenticator {
    private oauthFlow = new OAuthDeviceFlow()

    async authenticate(
        baseUrl: string,
        onDeviceCode?: (userCode: string, verificationUri: string) => void,
        onProgress?: (message: string) => void
    ): Promise<{ accessToken: string; refreshToken?: string; expiresAt: Date }> {
        onProgress?.('🔍 Checking for OIDC support...')

        // Check OIDC support
        const oidcConfig = await this.oauthFlow.checkOIDCSupport(baseUrl)
        if (!oidcConfig?.device_authorization_endpoint) {
            throw new Error('This Sourcegraph instance does not support OAuth device flow')
        }

        onProgress?.('✅ OIDC device flow supported')
        onProgress?.('🔄 Starting device authorization...')

        // Request device authorization
        const deviceAuth = await this.oauthFlow.requestDeviceAuthorization(
            oidcConfig.device_authorization_endpoint
        )

        onProgress?.('👉 Please complete authorization in your browser')

        // Notify UI about device code
        onDeviceCode?.(deviceAuth.user_code, deviceAuth.verification_uri)

        // Open browser automatically
        await vscode.env.openExternal(vscode.Uri.parse(deviceAuth.verification_uri))

        onProgress?.('⏳ Waiting for authorization...')

        // Poll for token
        const tokenResponse = await this.oauthFlow.pollForToken(
            oidcConfig.token_endpoint,
            deviceAuth.device_code,
            'cody-vscode',
            deviceAuth.interval
        )

        onProgress?.('✅ Authentication successful!')

        const expiresAt = new Date(Date.now() + tokenResponse.expires_in * 1000)

        return {
            accessToken: tokenResponse.access_token,
            refreshToken: tokenResponse.refresh_token,
            expiresAt,
        }
    }
}
