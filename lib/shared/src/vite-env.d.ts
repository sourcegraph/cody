/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly CODY_DEV_HARDCODE_SOME_NETWORK_REQUESTS: string
}

interface ImportMeta {
    readonly env: ImportMetaEnv
}
