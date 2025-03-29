import { Plus, Power, RefreshCw, X } from 'lucide-react'
import { Badge } from '../../shadcn/ui/badge'
import { Button } from '../../shadcn/ui/button'
import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from '../../shadcn/ui/card'
import { Input } from '../../shadcn/ui/input'
import { Label } from '../../shadcn/ui/label'
import type { ServerType } from '../types'

interface ServerDetailViewProps {
    server: ServerType
}

export function ServerDetailView({ server }: ServerDetailViewProps) {
    const ServerIcon = server.icon

    if (!server.env) {
        return
    }

    return (
        <div className="container py-6 max-w-5xl">
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded-md bg-primary/10">
                        <ServerIcon className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold">{server.name}</h1>
                        <p className="text-muted-foreground">{server.type}</p>
                    </div>
                    <Badge variant="info" className="ml-2">
                        {server.status}
                    </Badge>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" size="sm">
                        <RefreshCw className="mr-2 h-4 w-4" />
                        Restart
                    </Button>
                    <Button variant="default" size="sm">
                        <Power className="mr-2 h-4 w-4" />
                        {server.status === 'online' ? 'Stop' : 'Start'}
                    </Button>
                </div>
            </div>

            <Card className="mb-6">
                <CardHeader>
                    <CardTitle>Server Configuration</CardTitle>
                    <CardDescription>
                        Configure your server settings, environment variables, and startup commands.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="space-y-2">
                        <Label htmlFor="server-url">Server URL or Address</Label>
                        <Input id="server-url" value={server.url} />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="command">Command or Startup Script</Label>
                        <Input id="command" value={server.command} />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="args">Arguments (whitespace-separated)</Label>
                        <Input id="args" value={server.args} />
                    </div>

                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <Label>Environment Variables</Label>
                            <Button variant="outline" size="sm">
                                <Plus className="h-4 w-4 mr-1" /> Add
                            </Button>
                        </div>

                        {server.env.map((env, index) => (
                            // biome-ignore lint/suspicious/noArrayIndexKey: <explanation>
                            <div key={index} className="flex gap-2 items-center">
                                <Input className="flex-1" value={env.name} placeholder="VAR_NAME" />
                                <span className="text-muted-foreground">=</span>
                                <Input
                                    className="flex-1"
                                    value={env.value}
                                    placeholder="value"
                                    type={env.value.startsWith('u2022') ? 'password' : 'text'}
                                />
                                <Button variant="ghost" size="icon" className="shrink-0">
                                    <X className="h-4 w-4" />
                                </Button>
                            </div>
                        ))}
                    </div>
                </CardContent>
                <CardFooter className="flex justify-between">
                    <Button variant="outline">Reset</Button>
                    <Button>Save Changes</Button>
                </CardFooter>
            </Card>
        </div>
    )
}
