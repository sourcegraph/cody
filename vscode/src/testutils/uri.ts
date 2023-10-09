import { URI, Utils } from 'vscode-uri'
import { UriComponents } from 'vscode-uri/lib/umd/uri'

export class Uri {
    public static parse(value: string, strict?: boolean): Uri {
        return new Uri(URI.parse(value, strict))
    }

    public static file(path: string): URI {
        return new Uri(URI.file(path))
    }

    public static joinPath(base: Uri, ...pathSegments: string[]): Uri {
        return new Uri(Utils.joinPath(base.uri, ...pathSegments))
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

    get scheme() {
        return this.uri.scheme
    }

    get authority() {
        return this.uri.authority
    }
    get path() {
        return this.uri.path
    }

    get query() {
        return this.uri.query
    }

    get fragment() {
        return this.uri.fragment
    }

    get fsPath() {
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
