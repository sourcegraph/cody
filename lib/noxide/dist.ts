const PLATFORMS = [
    'x86_64-apple-darwin',
    'aarch64-apple-darwin',
    'x86_64-unknown-linux-gnu',
    'x86_64-unknown-linux-musl',
    'aarch64-unknown-linux-gnu',
    'aarch64-unknown-linux-musl',
    'x86_64-pc-windows-msvc',
    'aarch64-pc-windows-msvc',
]

async function buildAll() {
    for (const platform of PLATFORMS) {
        console.log(`Building for ${platform}...`)
        await Bun.spawn(
            [
                'bunx',
                'napi',
                'build',
                '--platform',
                '--release',
                '--target',
                platform,
                '--js=false',
                '--dts=types.ts',
                'node',
            ],
            {
                stdout: 'inherit',
                stderr: 'inherit',
            }
        )
    }
}

buildAll().catch(err => {
    console.error(err)
    process.exit(1)
})
