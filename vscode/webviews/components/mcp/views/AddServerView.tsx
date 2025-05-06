import { Plus } from 'lucide-react'
import * as React from 'react'
import { Button } from '../../shadcn/ui/button'
import type { ServerType } from '../types'
import { AddServerForm } from './AddServerForm'

interface AddServerDialogProps {
    onAddServer: (server: ServerType) => void
    className?: string
}

export function AddServerView({ onAddServer, className }: AddServerDialogProps) {
    const [open, setOpen] = React.useState(false)

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
                <Plus size={12} className="tw-mr-1" /> {open ? 'Cancel' : 'MCP Server'}
            </Button>
            {open && (
                <div className="tw-sm:max-w-[500px] tw-my-4">
                    <AddServerForm onAddServer={handleAddServer} />
                </div>
            )}
        </div>
    )
}
