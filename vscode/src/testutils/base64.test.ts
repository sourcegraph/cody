import { describe, expect, it } from 'vitest'

import { decodeCompressedBase64 } from './base64'

describe('base64', () => {
    it('decode', () => {
        const original: string = JSON.parse(
            '["H4sIAAAAAAAAA6pWSkksSVSyqlYqSc1JzU0tKaoEcYpSk/OLUlzLUvNKikH8xJzyxMpiv8wcJau80pyc2traWgAAAAD//wMAhHZ9ajoAAAA="]'
        )[0]
        expect(decodeCompressedBase64(original)).toMatchInlineSnapshot(`
          {
            "data": {
              "telemetry": {
                "recordEvents": {
                  "alwaysNil": null,
                },
              },
            },
          }
        `)
    })
})
