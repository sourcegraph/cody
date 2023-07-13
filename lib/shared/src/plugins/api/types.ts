import { Configuration } from '../../configuration'

// todo: rename to IPluginHandler or smth
export interface IPluginFunction {
    name: string
    description: string
    parameters: {
        type: 'object'
        properties: {
            [key: string]: {
                type: 'string' | 'number' | 'boolean'
                enum?: string[]
                description?: string
            }
        }
        description?: string
        required?: string[]
    }
    handler: (parameters: IPluginFunctionParameters, api: IPluginAPI) => Promise<IPluginFunctionOutput[]>
}

export interface IPluginFunctionOutput {
    url: string
    [key: string]: any
}

export type IPluginFunctionDescriptor = Omit<IPluginFunction, 'handler'>

export type IPluginFunctionParameters = Record<string, string | number | boolean>

export interface IPluginFunctionCallDescriptor {
    pluginName: string
    dataSource: IPluginFunction
    parameters: IPluginFunctionParameters
}

export interface IPluginContext {
    pluginName: string
    dataSourceName: string
    dataSourceParameters?: IPluginFunctionParameters
    context: any
}

export interface IPluginFunctionChosenDescriptor {
    name: string
    parameters: IPluginFunctionParameters
}

export interface IPlugin {
    name: string
    description: string
    dataSources: IPluginFunction[]
}

export interface IPluginAPI<TConfig = Configuration['pluginsConfig']> {
    config: TConfig
}
