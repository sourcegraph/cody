import { Globe, Plus, SaveIcon, X } from 'lucide-react'
import * as React from 'react'
import { useEffect } from 'react'
import { Button } from '../../shadcn/ui/button'
import { Label } from '../../shadcn/ui/label'
import type { ServerType } from '../types'

const _DEFAULT_CONFIG = {
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

const DEFAULT_CONFIG = { ..._DEFAULT_CONFIG } satisfies ServerType

interface AddServerFormProps {
    onAddServer: (server: ServerType) => void
    _server?: ServerType
    className?: string
}
export function AddServerForm({ onAddServer, _server }: AddServerFormProps) {
    const [formData, setFormData] = React.useState<ServerType>({ ...DEFAULT_CONFIG, ..._server })

    useEffect(() => {
        setFormData({ ..._DEFAULT_CONFIG, ..._server })
    }, [_server])

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()

        // Validate that either URL or command is provided
        if (!formData.url && !formData.command) {
            alert('You must provide either a URL or a command')
            return
        }

        onAddServer(formData)
        setFormData({ ...DEFAULT_CONFIG })
    }

    const updateArg = (argStr: string) => {
        setFormData({
            ...formData,
            args: argStr.split(' '),
        })
    }

    const addEnvVar = () => {
        const newFormData = { ...formData }
        newFormData.env?.push({ name: '', value: '' })
        setFormData(newFormData)
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
        <form id={_server?.id || ''} className="tw-w-full" onSubmit={handleSubmit}>
            <div className="tw-grid tw-gap-4 tw-p-2 tw-text-sm">
                <div className="tw-grid tw-grid-cols-2 tw-gap-4">
                    <div className="tw-space-y-2">
                        <Label htmlFor="name" className={_server?.name && ' tw-cursor-not-allowed'}>
                            Name {_server?.name && '(Read only in edit mode)'}
                        </Label>
                        <input
                            type="text"
                            id="name"
                            value={formData.name.replace(' ', '-')}
                            name="name"
                            onChange={e => setFormData({ ...formData, name: e.target.value })}
                            className={
                                (_server?.name && 'tw-cursor-not-allowed tw-text-muted-foreground ') +
                                'tw-block tw-py-2.5 tw-px-0 tw-w-full tw-text-sm tw-text-input-foreground tw-bg-transparent tw-border-0 tw-border-b-2 tw-border-gray-300 tw-appearance-none dark:tw-border-gray-600 dark:focus:tw-border-blue-500 focus:tw-outline-none focus:tw-ring-0 focus:tw-border-blue-600 peer'
                            }
                            placeholder=" "
                            required
                            disabled={Boolean(_server?.name)}
                            readOnly={Boolean(_server?.name)}
                        />
                    </div>
                </div>

                <div className="tw-space-y-2">
                    <Label htmlFor="command">Command</Label>
                    <input
                        id="command"
                        value={formData.command}
                        onChange={e => setFormData({ ...formData, command: e.target.value })}
                        className="tw-block tw-py-2.5 tw-px-0 tw-w-full tw-text-sm tw-text-input-foreground tw-bg-transparent tw-border-0 tw-border-b-2 tw-border-gray-300 tw-appearance-none dark:tw-border-gray-600 dark:focus:tw-border-blue-500 focus:tw-outline-none focus:tw-ring-0 focus:tw-border-blue-600 peer"
                        required={true}
                    />
                </div>

                <div className="tw-space-y-2">
                    <Label htmlFor="arguments">Arguments (whitespace-separated)</Label>
                    <input
                        id="arguments"
                        value={formData?.args?.join(' ')}
                        onChange={e => updateArg(e.target?.value)}
                        className="tw-block tw-py-2.5 tw-px-0 tw-w-full tw-text-sm tw-text-input-foreground tw-bg-transparent tw-border-0 tw-border-b-2 tw-border-gray-300 tw-appearance-none dark:tw-border-gray-600 dark:focus:tw-border-blue-500 focus:tw-outline-none focus:tw-ring-0 focus:tw-border-blue-600 peer"
                        required={true}
                    />
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
                                className="tw-block tw-py-2.5 tw-px-0 tw-w-full tw-text-sm tw-text-input-foreground tw-bg-transparent tw-border-0 tw-border-b-2 tw-border-gray-300 tw-appearance-none dark:tw-border-gray-600 dark:focus:tw-border-blue-500 focus:tw-outline-none focus:tw-ring-0 focus:tw-border-blue-600 peer"
                            />
                            <span className="tw-mx-1">=</span>
                            <input
                                value={env.value}
                                placeholder=""
                                onChange={e => updateEnvVar(index, 'value', e.target.value)}
                                type="password"
                                className="tw-block tw-py-2.5 tw-px-0 tw-w-full tw-text-sm tw-text-input-foreground tw-bg-transparent tw-border-0 tw-border-b-2 tw-border-gray-300 tw-appearance-none dark:tw-border-gray-600 dark:focus:tw-border-blue-500 focus:tw-outline-none focus:tw-ring-0 focus:tw-border-blue-600 peer"
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
            <div className="tw-px-2 tw-mt-2">
                <Button
                    variant="default"
                    size="sm"
                    className="tw-inline-flex tw-px-4 tw-w-full"
                    type="submit"
                >
                    <div className="tw-flex tw-items-center">
                        <SaveIcon size={16} className="tw-mr-3" /> Save
                    </div>
                </Button>
            </div>
        </form>
    )
}
