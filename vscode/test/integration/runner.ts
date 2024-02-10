import * as path from 'path'

import glob from 'glob'
import Mocha from 'mocha'

export function run(testsRoot: string): Promise<void> {
    const mocha = new Mocha({
        ui: 'tdd',
        color: true,
        timeout: 15000,
        grep: process.env.TEST_PATTERN ? new RegExp(process.env.TEST_PATTERN, 'i') : undefined,
    })

    return new Promise((resolve, reject) => {
        // The VS Code launch.json may pass a specific file to run just
        // that suite.
        const testSuitePath = process.env.RUN_TEST_PATH
        const pattern = testSuitePath ? `**/${testSuitePath}.js` : '**/**.test.js'
        glob(pattern, { cwd: testsRoot }, (err, files) => {
            if (err) {
                return reject(err)
            }

            // Add files to the test suite
            for (const file of files) {
                mocha.addFile(path.resolve(testsRoot, file))
            }

            try {
                // Run the mocha test
                mocha.run(failures => {
                    if (failures > 0) {
                        reject(new Error(`${failures} tests failed.`))
                    } else {
                        resolve()
                    }
                })
            } catch (error) {
                console.error(error)
                reject(error)
            }
        })
    })
}
