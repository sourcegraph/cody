import type { Uri as vscodeUri } from 'vscode'
import { URI } from 'vscode-uri'

/**
 * A URI string that has been validated to be a valid URI.
 *
 * @internal At runtime, this type is just a plain string; it does not have the `__brand` prop,
 * which is just the typechecker to ensure that {@link URIString} values only come from the
 * {@link uriString} function.
 *
 * @internal We use {@link URIString} values (i.e., strings) instead of URI instances when sending
 * URIs across a postMessage boundary to avoid differences in the various URI implementations'
 * `toJSON` methods and to avoid the unnecessary work of dehydrating and re-hydrating instances that
 * are not used by the caller.
 */
export type URIString = string & { __brand: 'URIString' }

/**
 * Create a {@link URIString} from a `vscode-uri` {@link URI} or a `vscode` {@link vscodeUri}.
 *
 * This function is the only safe way to create a {@link URIString} value.
 */
export function uriString(uri: URI | vscodeUri | URIString): URIString {
    return typeof uri === 'string' ? uri : (uri.toString() as URIString)
}

/**
 * Create a {@link URIString} from a string that is already known to be a valid URI. Use
 * {@link uriString} as `uriString(URI.parse(str))` unless you are sure that `str` is a valid URI.
 */
export function uriStringFromKnownValidString(knownValidURIString: string): URIString {
    return knownValidURIString as URIString
}

/**
 * Create a URI instance from a value that might be a {@link URIString}.
 */
export function uriInstance(uri: URI | vscodeUri | URIString): URI | vscodeUri {
    if (typeof uri === 'string') {
        return URI.parse(uri)
    }
    return uri
}
