import fspromises from 'node:fs/promises'
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
    // Deduplicates and installs macOS root certs onto the global agent. This is a no-op for
    // non-macOS environments
    try {
        require('mac-ca').addToGlobalAgent({ excludeBundled: false })
    } catch (e) {
        console.warn('Error installing macOS certs', e)
    }

    // Installs Windows root certs onto the global agent. This is a no-op for non-Windows
    // environments.
    try {
        require('win-ca/fallback').inject('+')
    } catch (e) {
        console.warn('Error installing Windows certs', e)
    }

    // Installs Linux root certs onto the global agent. This is a no-op for non-Linux environments.
    try {
        addLinuxCerts()
    } catch (e) {
        console.warn('Error installing Linux certs', e)
    }
}

const linuxPossibleCertPaths = ['/etc/ssl/certs/ca-certificates.crt', '/etc/ssl/certs/ca-bundle.crt']

function addLinuxCerts() {
    if (process.platform !== 'linux') {
        return
    }
    const originalCA = globalAgent.options.ca
    let cas
    if (!Array.isArray(originalCA)) {
        cas = typeof originalCA !== 'undefined' ? [originalCA] : []
    } else {
        cas = Array.from(originalCA)
    }
    loadLinuxCerts()
        .then(certs => cas.push(...certs))
        .catch(err => console.warn('Error loading Linux certs', err))
    globalAgent.options.ca = cas
}

async function loadLinuxCerts() {
    const certs = new Set()
    for (const path of linuxPossibleCertPaths) {
        try {
            const content = await fspromises.readFile(path, { encoding: 'utf8' })
            content
                .split(/(?=-----BEGIN CERTIFICATE-----)/g)
                .filter(pem => !!pem.length)
                .map(pem => certs.add(pem))
        } catch (err) {
            // this is the error code for "no such file"
            if (err?.code !== 'ENOENT') {
                console.warn(err)
            }
        }
    }
    return Array.from(certs)
}
