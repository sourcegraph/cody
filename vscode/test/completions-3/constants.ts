// When run, this script's filename is `vscode/dist/tsc/test/completions-3/main.js`, so

import path from 'path'

// __dirname is derived from that path, not this file's source path.
export const VSCODE_CODY_ROOT = path.resolve(__dirname, '..', '..', '..', '..')

// The test workspace is not copied to out/ during the TypeScript build, so we need to refer to
// it in the src/ dir.
export const TEST_WORKSPACE_PATH = path.resolve(VSCODE_CODY_ROOT, 'test', 'completions-3', 'workspace')

export const DATASETS_PATH = path.resolve(VSCODE_CODY_ROOT, 'test', 'completions-3', 'datasets')
