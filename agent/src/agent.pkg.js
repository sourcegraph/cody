// When running inside pkg-generated agent binary, read wasm from the
// same directory as the binary itself.  We can't use __dirname with the
// pkg-generated binary because that requires embedding all the wasm
// files with the binaries, which adds 60mb (compressed!) to the total
// plugin size instead of only 1.2mb for the compressed wasm files.
process.env.CODY_AGENT_PKG_BINARY = 'true'
require('./index.js')
