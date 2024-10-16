import { render as render_ } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AppWrapperForTest } from '../AppWrapperForTest'
import { PrettyPrintedContextItem } from './FileLink'
function render(element: JSX.Element): ReturnType<typeof render_> {
    return render_(element, { wrapper: AppWrapperForTest })
}

describe('PrettyPrintedContextItem', () => {
    it.each([
        { path: 'src/index.js', range: '10', expectedInnerText: 'index.js:10 src' },
        { path: 'README.md', range: '1-10', expectedInnerText: 'README.md:1-10' },
        {
            path: 'C:\\windows\\style\\path\\file.go',
            range: '1-5',
            expectedInnerText: 'file.go:1-5 C:\\windows\\style\\path',
        },
        {
            path: '\\\\remote\\server\\README.md',
            range: '1-5',
            expectedInnerText: 'README.md:1-5 \\\\remote\\server',
        },
        {
            repo: 'myRepo',
            path: 'foo/bar/baz.py',
            range: '1-10',
            expectedInnerText: 'baz.py:1-10 myRepo/foo/bar',
        },
        {
            repo: 'myRepo',
            path: '/foo/bar/baz.py',
            range: '1-10',
            expectedInnerText: 'baz.py:1-10 myRepo/foo/bar',
        },
        {
            repo: 'myRepo',
            path: 'README.md',
            range: '1-10',
            expectedInnerText: 'README.md:1-10 myRepo',
        },
        {
            repo: 'myRepo',
            path: 'subdir/README.md',
            range: '1-10',
            expectedInnerText: 'README.md:1-10 myRepo/subdir',
        },
        {
            repo: 'myRepo',
            path: '\\\\subdir\\README.md',
            range: '1-10',
            expectedInnerText: 'README.md:1-10 myRepo\\\\subdir',
        },
    ])(
        'renders correctly with path $path, range $range, repo $repo',
        ({ repo, path, range, expectedInnerText }) => {
            const { baseElement } = render(
                <PrettyPrintedContextItem path={path} range={range} repoShortName={repo} />
            )
            expect(baseElement.innerText.trim()).toEqual(expectedInnerText.trim())
        }
    )
})
