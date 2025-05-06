import { Plus } from 'lucide-react'
import * as React from 'react'
import { useEffect } from 'react'
import { Button } from '../../shadcn/ui/button'
import type { ServerType } from '../types'
import { AddServerForm } from './AddServerForm'

interface AddServerDialogProps {
    onAddServer: (server: ServerType) => void
    className?: string
    serverToEdit?: ServerType | null
}

export function AddServerView({ onAddServer, serverToEdit }: AddServerDialogProps) {
    const [open, setOpen] = React.useState(false)

    useEffect(() => {
        if (serverToEdit) {
            setOpen(true)
        }
    }, [serverToEdit])

    const handleAddServer = (server: ServerType) => {
        onAddServer(server)
        setOpen(false)
    }

    return (
        <div className="tw-px-2 tw-my-4">
            <Button
                variant="outline"
                size="sm"
                className="tw-inline-flex tw-w-full"
                onClick={() => setOpen(!open)}
            >
                <Plus size={12} className="tw-mr-1" />{' '}
                {open ? 'Cancel' : serverToEdit ? 'Edit Server' : 'MCP Server'}
            </Button>
            {open && (
                <div className="tw-sm:max-w-[500px] tw-my-4">
                    <AddServerForm
                        onAddServer={handleAddServer}
                        _server={open ? serverToEdit || undefined : undefined}
                    />
                </div>
            )}
        </div>
    )
}
