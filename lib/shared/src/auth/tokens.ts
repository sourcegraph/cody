import hex from 'crypto-js/enc-hex'
import sha256 from 'crypto-js/sha256'

export function dotcomTokenToGatewayToken(dotcomToken?: string | null): string | undefined {
    if (!dotcomToken) {
        return undefined
    }

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

    const accessTokenBytes = hex.parse(hexEncodedAccessTokenBytes)
    const gatewayTokenBytes = sha256(sha256(accessTokenBytes)).toString()
    return 'sgd_' + gatewayTokenBytes
}
