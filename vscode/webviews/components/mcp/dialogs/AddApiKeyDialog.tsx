import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogTitle,
    DialogTrigger,
} from '@radix-ui/react-dialog'
import { Plus } from 'lucide-react'
import * as React from 'react'
import { Button } from '../../shadcn/ui/button'
import { Input } from '../../shadcn/ui/input'
import { Label } from '../../shadcn/ui/label'
import type { ApiKey } from '../types'

interface AddApiKeyDialogProps {
    onAddApiKey: (apiKey: Omit<ApiKey, 'id' | 'created' | 'lastUsed'>) => void
    className?: string
}

export function AddApiKeyDialog({ onAddApiKey, className }: AddApiKeyDialogProps) {
    const [open, setOpen] = React.useState(false)
    const [formData, setFormData] = React.useState({
        name: '',
        key: '••••••••••••••••••••••••••••••••',
    })

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        onAddApiKey(formData)
        setOpen(false)
        setFormData({
            name: '',
            key: '••••••••••••••••••••••••••••••••',
        })
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="outline" size="sm" className={className}>
                    <Plus className="tw-h-4 tw-w-4 tw-mr-1" /> Add API Key
                </Button>
            </DialogTrigger>
            <DialogContent className="tw-sm:max-w-[425px]">
                <form onSubmit={handleSubmit}>
                    <DialogTitle>Add New API Key</DialogTitle>
                    <DialogDescription>
                        Create a new API key for accessing your services.
                    </DialogDescription>
                    <div className="tw-grid tw-gap-4 tw-py-4">
                        <div className="tw-space-y-2">
                            <Label htmlFor="key-name">API Key Name</Label>
                            <Input
                                id="key-name"
                                value={formData.name}
                                onChange={e => setFormData({ ...formData, name: e.target.value })}
                                placeholder="e.g. Production API Key"
                                required
                            />
                        </div>

                        <div className="tw-space-y-2">
                            <Label htmlFor="key-value">API Key Value</Label>
                            <div className="tw-flex tw-gap-2">
                                <Input
                                    id="key-value"
                                    value={formData.key}
                                    type="password"
                                    readOnly
                                    className="tw-flex-1"
                                />
                                <Button type="button" variant="outline" size="sm">
                                    Generate
                                </Button>
                            </div>
                            <p className="tw-text-xs tw-text-muted-foreground">
                                This key will only be shown once when created. Make sure to copy it.
                            </p>
                        </div>
                    </div>
                    <div>
                        <Button type="submit">Create API Key</Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    )
}
