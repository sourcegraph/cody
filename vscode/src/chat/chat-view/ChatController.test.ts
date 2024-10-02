import { describe, expect, it, vi } from 'vitest'
import { Uri } from 'vscode'
import { manipulateWebviewHTML } from './ChatController'

vi.mock('../../services/AuthProvider', () => ({}))

describe('manipulateWebviewHTML', () => {
    const options = {
        cspSource: 'self',
    }
    it('replaces relative paths with resource paths', () => {
        const html = '<img src="./image.png">'
        const result = manipulateWebviewHTML(html, {
            ...options,
            resources: Uri.parse('https://example.com/resources'),
        })
        expect(result).toBe('<img src="https://example.com/resources/image.png">')
    })

    it('injects script and removes CSP when injectScript is provided', () => {
        const html =
            '<!-- START CSP --><meta http-equiv="Content-Security-Policy" content="default-src \'none\';"><!-- END CSP --><script>/*injectedScript*/</script>'
        const result = manipulateWebviewHTML(html, {
            ...options,
            injectScript: 'console.log("Injected script")',
        })
        expect(result).not.toContain('Content-Security-Policy')
        expect(result).toContain('console.log("Injected script")')
    })

    it('injects style and removes CSP when injectStyle is provided', () => {
        const html =
            '<!-- START CSP --><meta http-equiv="Content-Security-Policy" content="default-src \'none\';"><!-- END CSP --><style>/*injectedStyle*/</style>'
        const result = manipulateWebviewHTML(html, {
            ...options,
            injectStyle: 'body { background: red; }',
        })
        expect(result).not.toContain('Content-Security-Policy')
        expect(result).toContain('body { background: red; }')
    })

    it('updates CSP source when no injection is provided', () => {
        const html =
            '<meta http-equiv="Content-Security-Policy" content="default-src \'self\' {cspSource};">'
        const result = manipulateWebviewHTML(html, {
            ...options,
            cspSource: 'https://example.com',
        })
        expect(result).toBe(
            '<meta http-equiv="Content-Security-Policy" content="default-src https://example.com https://example.com;">'
        )
    })

    it('handles multiple replacements correctly', () => {
        const html =
            '<!-- START CSP --><meta http-equiv="Content-Security-Policy" content="default-src \'self\';"><!-- END CSP --><img src="./image1.png"><img src="./image2.png"><script>/*injectedScript*/</script><style>/*injectedStyle*/</style>'
        const result = manipulateWebviewHTML(html, {
            ...options,
            resources: Uri.parse('https://example.com/resources'),
            injectScript: 'console.log("Test")',
            injectStyle: 'body { color: blue; }',
        })
        expect(result).not.toContain('Content-Security-Policy')
        expect(result).toContain('https://example.com/resources/image1.png')
        expect(result).toContain('https://example.com/resources/image2.png')
        expect(result).toContain('console.log("Test")')
        expect(result).toContain('body { color: blue; }')
    })
})
