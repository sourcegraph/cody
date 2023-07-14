import { Configuration } from '../../configuration'

export type PluginFunctionParameters = Record<string, string | number | boolean>

export interface PluginFunctionDescriptor {
    name: string
    description: string
    parameters: {
        type: 'object'
        properties: {
            [key: string]: {
                type: 'string' | 'number' | 'boolean'
                enum?: string[]
                description?: string
                default?: string | number | boolean
            }
        }
        description?: string
        required?: string[]
    }
}

export interface PluginFunctionOutput {
    url: string
    [key: string]: any
}

type FunctionHandler = (parameters: PluginFunctionParameters, api: PluginAPI) => Promise<PluginFunctionOutput[]>

interface PluginFunction {
    descriptor: PluginFunctionDescriptor
    handler: FunctionHandler
}

export interface PluginFunctionWithParameters extends PluginFunction {
    pluginName: string
    parameters: PluginFunctionParameters
}

export interface PluginFunctionExecutionInfo {
    name: string
    pluginName: string
    parameters?: PluginFunctionParameters
    output: PluginFunctionOutput[]
    error?: any
}

export interface PluginChosenFunctionDescriptor {
    name: string
    parameters: PluginFunctionParameters
}

export interface Plugin {
    name: string
    description: string
    dataSources: PluginFunction[]
}

export interface PluginAPI<TConfig = Configuration['pluginsConfig']> {
    config: TConfig
}
