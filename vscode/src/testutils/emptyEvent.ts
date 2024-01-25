import type * as vscode_types from 'vscode'

import { emptyDisposable } from './emptyDisposable'

export function emptyEvent<T>(): vscode_types.Event<T> {
    return () => emptyDisposable
}
