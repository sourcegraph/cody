import { Power } from 'lucide-react'
import { Button } from '../../shadcn/ui/button'
import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from '../../shadcn/ui/card'
import type { ServerType } from '../types'
import { AddServerForm } from './AddServerForm'

interface ServerDetailViewProps {
    server: ServerType
    onAddServer: (server: ServerType) => void
}

export function ServerDetailView({ server, onAddServer }: ServerDetailViewProps) {
    return (
        <div className="tw-container tw-p-6 tw-w-full">
            <Card className="tw-m-6 tw-w-full">
                <CardHeader>
                    <CardTitle>{server.name}</CardTitle>
                    <CardDescription>
                        <Button variant="default" size="sm">
                            <Power size={12} />
                            {server.status === 'online' ? 'Disconnet' : 'Connet'}
                        </Button>
                    </CardDescription>
                </CardHeader>
                <CardContent className="tw-space-y-6">
                    <AddServerForm _server={server} onAddServer={onAddServer} />
                </CardContent>
                <CardFooter className="tw-flex tw-justify-between">
                    <Button variant="outline">Reset</Button>
                    <Button>Save Changes</Button>
                </CardFooter>
            </Card>
        </div>
    )
}
