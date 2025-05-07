import { Plus, XIcon } from 'lucide-react'
import * as React from 'react'
import { useEffect } from 'react'
import { Button } from '../../shadcn/ui/button'
import type { ServerType } from '../types'
import { AddServerForm } from './AddServerForm'

interface AddServerDialogProps {
    onAddServer: (server: ServerType) => void
    className?: string
    serverToEdit?: ServerType | null
    setServerToEdit: (server: ServerType | null) => void
}

export function AddServerView({ onAddServer, serverToEdit, setServerToEdit }: AddServerDialogProps) {
    const [open, setOpen] = React.useState(false)

    useEffect(() => {
        setOpen(!!serverToEdit)
    }, [serverToEdit])

    const handleToggle = (value: boolean) => {
        setOpen(value)
        if (!value) setServerToEdit(null)
    }

    const handleAddServer = (server: ServerType) => {
        onAddServer(server)
        setServerToEdit(null)
        setOpen(false)
    }

    return (
        <div className="tw-px-2 tw-my-4">
            <Button
                variant="outline"
                size="sm"
                className="tw-inline-flex tw-w-full"
                onClick={() => handleToggle(!open)}
                title={open ? 'Cancel' : 'Add a new MCP Server'}
            >
                {open ? <XIcon size={12} className="tw-mr-1" /> : <Plus size={12} className="tw-mr-1" />}
                {open ? 'Cancel' : 'MCP Server'}
            </Button>
            {open && (
                <div className="tw-sm:max-w-[500px] tw-my-4">
                    <AddServerForm onAddServer={handleAddServer} _server={serverToEdit || undefined} />
                </div>
            )}
        </div>
    )
}
