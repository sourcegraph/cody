import path from 'path'

export const VSCODE_CODY_ROOT = path.resolve(__dirname, '..', '..', '..', '..')
export const TEST_WORKSPACE_PATH = path.resolve(VSCODE_CODY_ROOT, 'test', 'benchmark', 'fixtures', 'workspace')
export const EXTENSION_TEST_PATH = path.resolve(VSCODE_CODY_ROOT, 'dist', 'tsc', 'test', 'benchmark', 'index')
export const DATASETS_PATH = path.resolve(VSCODE_CODY_ROOT, 'test', 'benchmark', 'datasets')
export const OUTPUT_TEMPLATE = path.resolve(VSCODE_CODY_ROOT, 'test', 'benchmark', 'fixtures', 'output.json')
export const OUTPUT_PATH = path.resolve(VSCODE_CODY_ROOT, 'test', 'benchmark', 'results')

export const CODY_EXTENSION_ID = 'sourcegraph.cody-ai'
export const CODY_EXTENSION_CHANNEL_ID = 'extension-output-sourcegraph.cody-ai-#1-Cody by Sourcegraph'

export const CURSOR = '🔥'
