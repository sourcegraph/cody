import { type ContextItem, displayPath, setDisplayPathEnvInfo } from '@sourcegraph/cody-shared'
import { describe, expect, test } from 'vitest'
import { URI } from 'vscode-uri'
import { renderContextItem } from './utils'

setDisplayPathEnvInfo({
    workspaceFolders: [URI.parse('file:///')],
    isWindows: false,
})

describe('renderContextItem', () => {
    const fileUri = URI.parse('file:///file.go')
    const providerUri = 'http://provider.com'

    test.each<{ item: ContextItem; name?: string; want: string | null }>([
        {
            name: 'openctx item',
            item: {
                type: 'openctx',
                provider: 'openctx',
                kind: 'item',
                providerUri,
                uri: fileUri,
                title: 'TITLE',
                content: 'CONTENT',
            },
            want: `Content for "TITLE" from ${displayPath(fileUri)}:\nCONTENT`,
        },
        {
            name: 'openctx annotation',
            item: {
                type: 'openctx',
                provider: 'openctx',
                kind: 'annotation',
                providerUri,
                uri: fileUri,
                title: 'TITLE',
                content: 'CONTENT',
            },
            want: `Annotation for ${displayPath(fileUri)}:\n"TITLE"\nCONTENT`,
        },
    ])('$name', tt => {
        const got = renderContextItem(tt.item)
        if (tt.want === null) {
            expect(got).toBeNull()
            return
        }
        expect(got).not.toBeNull()
        expect(got!.text.toString()).toEqual(tt.want)
    })
})
