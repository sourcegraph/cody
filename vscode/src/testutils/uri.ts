import { URI, Utils } from 'vscode-uri'
import type { UriComponents } from 'vscode-uri/lib/umd/uri'

/**
 *
 * This `Uri` class is a reimplemenation of `vscode.Uri` that is backed by
 * vscode-uri. The reason we reimplement `vscode.Uri` instead of using URI
 * directly in mocks is that we want full runtime fidelity with `vscode.Uri`. If
 * we use URI directly then we end up with minor runtime differences. For
 * example:
 *
 * - vscode.Uri.parse(..) instanceof URI // Should be false
 * - vscode.Uri.joinPath(..)             // Does not exist in URI
 *
 * We opened an issue about adding `joinPath` as a static function, which got
 * closed as wontfix https://github.com/microsoft/vscode/issues/194615
 *
 * We tried copy-pasting the full implementation of `vscode.Uri` into this
 * repository but it required adding >3k lines of code with minor that we have
 * to keep up-to-date and maintain. https://github.com/sourcegraph/cody/pull/1264

 * We tried using `Proxy` to avoid having to reimplement all APIs but this
 * solution didn't faithfully reproduce the behavior of `instanceof` checks.
 * https://github.com/sourcegraph/cody/pull/1335
 *
 * See agent/src/vscode-shim.test.ts for tests that assert that this class
 * is compatible with `vscode.Uri`.
 */
export class Uri {
    public static parse(value: string, strict?: boolean): Uri {
        return new Uri(URI.parse(value, strict))
    }

    public static file(path: string): Uri {
        return new Uri(URI.file(path))
    }

    public static joinPath(base: Uri, ...pathSegments: string[]): Uri {
        return new Uri(Utils.joinPath(base.uri ?? new Uri(base), ...pathSegments))
    }

    public static from(components: {
        readonly scheme: string
        readonly authority?: string
        readonly path?: string
        readonly query?: string
        readonly fragment?: string
    }): Uri {
        return new Uri(URI.from(components))
    }

    private uri: URI

    private constructor(componentsOrUri: UriComponents | URI) {
        if (componentsOrUri instanceof URI) {
            this.uri = componentsOrUri
        } else {
            this.uri = URI.from(componentsOrUri)
        }
    }

    public get scheme(): string {
        return this.uri.scheme
    }

    public get authority(): string {
        return this.uri.authority
    }
    public get path(): string {
        return this.uri.path
    }

    public get query(): string {
        return this.uri.query
    }

    public get fragment(): string {
        return this.uri.fragment
    }

    public get fsPath(): string {
        return this.uri.fsPath
    }

    public with(change: {
        scheme?: string
        authority?: string
        path?: string
        query?: string
        fragment?: string
    }): Uri {
        return Uri.from({
            scheme: change.scheme || this.scheme,
            authority: change.authority || this.authority,
            path: change.path || this.path,
            query: change.query || this.query,
            fragment: change.fragment || this.fragment,
        })
    }

    public toString(skipEncoding?: boolean): string {
        return this.uri.toString(skipEncoding)
    }

    public toJSON(): any {
        return {
            scheme: this.scheme,
            authority: this.authority,
            path: this.path,
            query: this.query,
            fragment: this.fragment,
        }
    }
}
