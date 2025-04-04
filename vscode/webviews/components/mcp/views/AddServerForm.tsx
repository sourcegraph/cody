import { Globe, Plus, SaveIcon, X } from 'lucide-react'
import * as React from 'react'
import { Button } from '../../shadcn/ui/button'
import { Label } from '../../shadcn/ui/label'
import type { ServerType } from '../types'

const DEFAULT_CONFIG = {
    id: crypto.randomUUID(), // Add a unique id
    name: '',
    type: 'MCP',
    status: 'online' as const,
    icon: Globe,
    url: '',
    command: '',
    args: [''],
    env: [{ name: '', value: '' }],
} satisfies ServerType

interface AddServerFormProps {
    onAddServer: (server: ServerType) => void
    _server?: ServerType
    className?: string
}
export function AddServerForm({ onAddServer, _server }: AddServerFormProps) {
    const [formData, setFormData] = React.useState<ServerType>({ ...DEFAULT_CONFIG, ..._server })

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        onAddServer(formData)
        setFormData({ ...DEFAULT_CONFIG })
    }

    const addArg = (index: number, arg: string) => {
        const args = formData.args || []
        args[index] = arg
        setFormData({
            ...formData,
            args,
        })
    }

    const addEnvVar = () => {
        const newFormData = { ...formData }
        newFormData.env?.push({ name: '', value: '' })
        setFormData(newFormData)
    }

    const removeArg = (index: number) => {
        const newArgs = formData.args || DEFAULT_CONFIG.args
        setFormData({
            ...formData,
            args: newArgs.splice(index, 1),
        })
    }
    const updateEnvVar = (index: number, field: 'name' | 'value', value: string) => {
        const env = formData.env || DEFAULT_CONFIG.env
        const newEnv = [...env]
        newEnv[index][field] = value
        setFormData({
            ...formData,
            env: newEnv,
        })
    }

    const removeEnvVar = (index: number) => {
        const env = formData.env || DEFAULT_CONFIG.env
        const newEnv = [...env]
        newEnv.splice(index, 1)
        setFormData({
            ...formData,
            env: newEnv,
        })
    }

    return (
        <form onSubmit={handleSubmit}>
            <div className="tw-grid tw-gap-4 tw-py-4 tw-text-sm">
                <div className="tw-grid tw-grid-cols-2 tw-gap-4">
                    <div className="tw-space-y-2">
                        <Label htmlFor="name">Name</Label>
                        <input
                            type="text"
                            id="name"
                            value={formData.name}
                            name="name"
                            onChange={e => setFormData({ ...formData, name: e.target.value })}
                            className="tw-block tw-py-2.5 tw-px-0 tw-w-full tw-text-sm tw-text-gray-900 tw-bg-transparent tw-border-0 tw-border-b-2 tw-border-gray-300 tw-appearance-none dark:tw-text-white dark:tw-border-gray-600 dark:focus:tw-border-blue-500 focus:tw-outline-none focus:tw-ring-0 focus:tw-border-blue-600 peer"
                            placeholder=" "
                            required
                        />
                    </div>
                </div>

                <div className="tw-space-y-2">
                    <Label htmlFor="command">Command</Label>
                    <input
                        id="command"
                        value={formData.command}
                        onChange={e => setFormData({ ...formData, type: e.target.value })}
                        className="tw-block tw-py-2.5 tw-px-0 tw-w-full tw-text-sm tw-text-gray-900 tw-bg-transparent tw-border-0 tw-border-b-2 tw-border-gray-300 tw-appearance-none dark:tw-text-white dark:tw-border-gray-600 dark:focus:tw-border-blue-500 focus:tw-outline-none focus:tw-ring-0 focus:tw-border-blue-600 peer"
                        placeholder="npx"
                        required
                    />
                </div>

                <div className="tw-space-y-2">
                    <Label htmlFor="url">URL</Label>
                    <input
                        id="url"
                        size={12}
                        value={formData.url}
                        onChange={e => setFormData({ ...formData, url: e.target.value })}
                        className="tw-block tw-py-2.5 tw-px-0 tw-w-full tw-text-sm tw-text-gray-900 tw-bg-transparent tw-border-0 tw-border-b-2 tw-border-gray-300 tw-appearance-none dark:tw-text-white dark:tw-border-gray-600 dark:focus:tw-border-blue-500 focus:tw-outline-none focus:tw-ring-0 focus:tw-border-blue-600 peer"
                        placeholder="Make sure you pass in the absolute path to your server."
                        required
                    />
                </div>

                <div className="tw-space-y-3">
                    <div className="tw-flex tw-items-center tw-justify-between">
                        <Label>Arguments</Label>
                        <Button type="button" variant="ghost" size="sm" onClick={addEnvVar}>
                            <Plus size={14} />
                        </Button>
                    </div>

                    {formData?.args?.map((arg, index) => (
                        // biome-ignore lint/suspicious/noArrayIndexKey: <explanation>
                        <div key={index} className="tw-flex tw-gap-2 tw-items-center">
                            <input
                                value={arg}
                                placeholder=""
                                onChange={e => addArg(index, e.target.value)}
                                className="tw-block tw-py-2.5 tw-px-0 tw-w-full tw-text-sm tw-text-gray-900 tw-bg-transparent tw-border-0 tw-border-b-2 tw-border-gray-300 tw-appearance-none dark:tw-text-white dark:tw-border-gray-600 dark:focus:tw-border-blue-500 focus:tw-outline-none focus:tw-ring-0 focus:tw-border-blue-600 peer"
                            />
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="tw-shrink-0"
                                onClick={() => removeArg(index)}
                            >
                                <X size={14} className="tw-ml-1" />
                            </Button>
                        </div>
                    ))}
                </div>

                <div className="tw-space-y-2">
                    <div className="tw-flex tw-items-center tw-justify-between">
                        <Label>Environment Variables</Label>
                        <Button type="button" variant="ghost" size="sm" onClick={addEnvVar}>
                            <Plus size={14} />
                        </Button>
                    </div>
                </div>
                <div className="tw-space-y-3 tw-w-full">
                    {formData?.env?.map((env, index) => (
                        // biome-ignore lint/suspicious/noArrayIndexKey: <explanation>
                        <div key={index} className="tw-flex tw-gap-2 tw-items-center">
                            <input
                                value={env.name}
                                placeholder=""
                                onChange={e => updateEnvVar(index, 'name', e.target.value)}
                                className="tw-block tw-py-2.5 tw-px-0 tw-w-full tw-text-sm tw-text-gray-900 tw-bg-transparent tw-border-0 tw-border-b-2 tw-border-gray-300 tw-appearance-none dark:tw-text-white dark:tw-border-gray-600 dark:focus:tw-border-blue-500 focus:tw-outline-none focus:tw-ring-0 focus:tw-border-blue-600 peer"
                            />
                            <span className="tw-mx-1">=</span>
                            <input
                                value={env.value}
                                placeholder=""
                                onChange={e => updateEnvVar(index, 'value', e.target.value)}
                                className="tw-block tw-py-2.5 tw-px-0 tw-w-full tw-text-sm tw-text-gray-900 tw-bg-transparent tw-border-0 tw-border-b-2 tw-border-gray-300 tw-appearance-none dark:tw-text-white dark:tw-border-gray-600 dark:focus:tw-border-blue-500 focus:tw-outline-none focus:tw-ring-0 focus:tw-border-blue-600 peer"
                            />
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="tw-shrink-0"
                                onClick={() => removeEnvVar(index)}
                            >
                                <X size={14} className="tw-ml-1" />
                            </Button>
                        </div>
                    ))}
                </div>
            </div>
            <div>
                <Button variant="default" size="sm" className="tw-inline-flex tw-w-full">
                    <SaveIcon size={12} className="tw-mr-1" /> Save
                </Button>
            </div>
        </form>
    )
}
