// `TESTING_DOTCOM_URL` is not set in webviews. If `isDotCom` helper it called from the webview it will use
// the default ('https://sourcegraph.com') value.
export const DOTCOM_URL = new URL(
    (typeof process === 'undefined' ? null : process.env.TESTING_DOTCOM_URL) ?? 'https://sourcegraph.com'
)
export const LOCAL_APP_URL = new URL('http://localhost:3080')

// 🚨 SECURITY: This is used as a check for logging chatTranscript for dotcom users only, be extremely careful if modifying this function
export function isDotCom(url: string): boolean {
    try {
        return new URL(url).origin === DOTCOM_URL.origin
    } catch {
        return false
    }
}
