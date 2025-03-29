import { Dialog, DialogContent, DialogTrigger } from '@radix-ui/react-dialog'
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
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="tw-inline-flex tw-w-full" disabled={open}>
                    <Plus size={12} className="tw-mr-1" /> Add Server
                </Button>
            </DialogTrigger>
            <DialogContent className="tw-sm:max-w-[500px] tw-my-4">
                <AddServerForm onAddServer={handleAddServer} />
            </DialogContent>
        </Dialog>
    )
}
