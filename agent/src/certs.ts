import fspromises from 'node:fs/promises'
import { globalAgent } from 'node:https';



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
    require('win-ca').inject('+')

    // Installs linux root certs onto the global agent
    // This is a no op for non-linux environments
    try {
        addLinuxCerts()
    } catch (e) {
        console.warn('Error installing linux certs', e)
    }
}


const linuxPossibleCertPaths = [
    '/etc/ssl/certs/ca-certificates.crt',
    '/etc/ssl/certs/ca-bundle.crt'
]

 function addLinuxCerts()  {
    if (process.platform !== 'linux') {
        return 
    }
    const originalCA = globalAgent.options.ca
    let cas: (string | Buffer)[];
    if (!Array.isArray(originalCA)) {
        cas = typeof originalCA !== 'undefined' ? [originalCA] : [];
    } else {
        cas = Array.from(originalCA);
    }

    loadLinuxCerts()
        .then(certs => cas.push(...certs))
        .catch(err => console.warn('Error loading linux certs', err))
    globalAgent.options.ca = cas
}

async function loadLinuxCerts(): Promise<Array<string>>{
    
    const certs = new Set<string>()

    for  (const path of linuxPossibleCertPaths) {
		try {
			const content :string = await fspromises.readFile(path, { encoding: 'utf8' });
			content.split(/(?=-----BEGIN CERTIFICATE-----)/g)
				.filter(pem => !!pem.length)
                .map(certs.add)
		} catch (err: any) {
            // this is the error code for "no such file"
			if (err?.code !== 'ENOENT') {
				console.warn(err);  
			}
		}
	}
    return Array.from(certs)
}

