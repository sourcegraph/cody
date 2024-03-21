import { SHA256, enc } from 'crypto-js'

export function dotcomTokenToGatewayToken(dotcomToken: string): string | undefined {
    const DOTCOM_TOKEN_REGEX: RegExp =
        /^(?:sgph?_)?(?:[\da-fA-F]{16}_|local_)?(?<hexbytes>[\da-fA-F]{40})$/
    const match = DOTCOM_TOKEN_REGEX.exec(dotcomToken)

    if (!match) {
        return undefined
    }

    const hexEncodedAccessTokenBytes = match?.groups?.hexbytes

    if (!hexEncodedAccessTokenBytes) {
        return undefined
    }

    const accessTokenBytes = enc.Hex.parse(hexEncodedAccessTokenBytes)
    const gatewayTokenBytes = SHA256(SHA256(accessTokenBytes)).toString()
    return 'sgd_' + gatewayTokenBytes
}
