import { page } from '$app/state'

export function isActiveURL(url: string, exact = false): boolean {
    return page.url.pathname === url || (!exact && page.url.pathname.startsWith(`${url}/`))
}
