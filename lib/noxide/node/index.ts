import type * as lib from "./types";

export type * from "./types";

export function load(): typeof lib | null {
    if(typeof process === 'undefined' || !process?.platform || !process?.arch){
        // This is not a Node.js process
        return null
    }

    return importLib(process) as typeof lib
}

export type Noxide = typeof lib

function importLib({platform, arch}: Pick<typeof process, "platform" | "arch">) {
  switch (platform) {
      case 'android':
          switch (arch) {
            //   case 'arm64':
            //       //@ts-ignore
            //       return require('./noxide.android-arm64.node')
            //   case 'arm':
            //       return require('./noxide.android-arm-eabi.node')
              default:
                  throw new Error(`Unsupported architecture on Android ${arch}`)
          }
      case 'win32':
          switch (arch) {
              case 'x64':
                  return require('./noxide.win32-x64-msvc.node')
            //   case 'ia32':
            //       return require('./noxide.win32-ia32-msvc.node')
              case 'arm64':
                  return require('./noxide.win32-arm64-msvc.node')
              default:
                  throw new Error(`Unsupported architecture on Windows: ${arch}`)
          }
      case 'darwin':
        //   try {
        //       return require('./noxide.darwin-universal.node')
        //   } catch {
              switch (arch) {
                  case 'x64':
                      return require('./noxide.darwin-x64.node')
                  case 'arm64':
                      return require('./noxide.darwin-arm64.node')
                  default:
                      throw new Error(`Unsupported architecture on macOS: ${arch}`)
              }
        //   }
    //   case 'freebsd':
    //       if (arch !== 'x64') {
    //           throw new Error(`Unsupported architecture on FreeBSD: ${arch}`)
    //       }
    //       return require('./noxide.freebsd-x64.node')
      case 'linux':
          switch (arch) {
              case 'x64':
                  return require(isMusl() ? './noxide.linux-x64-musl.node' : './noxide.linux-x64-gnu.node')
              case 'arm64':
                  return require(isMusl() ? './noxide.linux-arm64-musl.node' : './noxide.linux-arm64-gnu.node')
            //   case 'arm':
            //       return require(isMusl() ? './noxide.linux-arm-musleabihf.node' : './noxide.linux-arm-gnueabihf.node')
            //   case 'riscv64':
            //       return require(isMusl() ? './noxide.linux-riscv64-musl.node' : './noxide.linux-riscv64-gnu.node')
            //   case 's390x':
            //       return require('./noxide.linux-s390x-gnu.node')
              default:
                  throw new Error(`Unsupported architecture on Linux: ${arch}`)
          }
      default:
          throw new Error(`Unsupported OS: ${platform}, architecture: ${arch}`)
  }
}
function isMusl() {
    // For Node 10
    if (!process.report || typeof process.report.getReport !== 'function') {
        try {
          const lddPath = require('node:child_process').execSync('which ldd').toString().trim()
          return require('node:fs').readFileSync(lddPath, 'utf8').includes('musl')
        } catch (e) {
          return true
        }
      } else {
      //@ts-ignore
        const { glibcVersionRuntime } = process.report.getReport().header
        return !glibcVersionRuntime
      }
}
