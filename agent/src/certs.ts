import { readFileSync } from 'node:fs'
import { globalAgent } from 'node:https'

/**
 * Registers local root certificates onto the global HTTPS agent.
 *
 * On macOS, this adds macOS root certs.
 * On Windows, this adds Windows root certs.
 * On Linux, this adds Linux root certs.
 *
 * This allows HTTPS requests made via the global agent to trust these root certs.
 */
export function registerLocalCertificates() {
    // Deduplicates and installs mac root certs onto the global agent
    // This is a no op for non-mac environments
    require('mac-ca').addToGlobalAgent({ excludeBundled: false })

    // Installs windows root certs onto the global agent
    // This is a no op for non-windows environments
    require('win-ca/fallback').inject('+')

    // Installs linux root certs onto the global agent
    // This is a no op for non-linux environments
    try {
        addLinuxCerts()
    } catch (e) {
        console.warn('Error installing linux certs', e)
    }
}

const linuxPossibleCertPaths = ['/etc/ssl/certs/ca-certificates.crt', '/etc/ssl/certs/ca-bundle.crt']

function addLinuxCerts() {
    if (process.platform !== 'linux') {
        return
    }
    const originalCA = globalAgent.options.ca
    let cas: (string | Buffer)[]
    if (!Array.isArray(originalCA)) {
        cas = typeof originalCA !== 'undefined' ? [originalCA] : []
    } else {
        cas = Array.from(originalCA)
    }

    try {
        cas.push(...loadLinuxCerts())
    } catch (err) {
        console.warn('Error loading linux certs', err)
    }
    globalAgent.options.ca = cas
}

function loadLinuxCerts(): Array<string> {
    const certs = new Set<string>()

    for (const path of linuxPossibleCertPaths) {
        try {
            const content: string = readFileSync(path, { encoding: 'utf8' })
            content
                .split(/(?=-----BEGIN CERTIFICATE-----)/g)
                .filter(pem => !!pem.length)
                .map(pem => certs.add(pem))
        } catch (err: any) {
            // this is the error code for "no such file"
            if (err?.code !== 'ENOENT') {
                console.warn(err)
            }
        }
    }
    return Array.from(certs)
}
