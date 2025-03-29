import { Key, MoreHorizontal } from 'lucide-react'
import { Button } from '../../shadcn/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../shadcn/ui/card'
import { AddApiKeyDialog } from '../dialogs/AddApiKeyDialog'
import type { ApiKey } from '../types'

interface ApiKeysViewProps {
    apiKeys: ApiKey[]
    isSidebarView: boolean
}

export function ApiKeysView({ apiKeys, isSidebarView }: ApiKeysViewProps) {
    return (
        <div className="container py-6">
            <h2 className="text-2xl font-bold mb-6">API Keys</h2>

            <Card>
                <CardHeader>
                    <CardTitle>Manage API Keys</CardTitle>
                    <CardDescription>
                        Create and manage API keys for accessing your services.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {apiKeys.length > 0 ? (
                        <div className="border rounded-md">
                            <div className="grid grid-cols-3 gap-4 p-3 border-b bg-muted/50 font-medium text-sm">
                                <div>Name</div>
                                <div>Created</div>
                                <div>Last Used</div>
                            </div>
                            {apiKeys.map(apiKey => (
                                <div
                                    key={apiKey.id}
                                    className="grid grid-cols-3 gap-4 p-3 border-b last:border-0 text-sm"
                                >
                                    <div className="flex items-center gap-2">
                                        <Key className="h-4 w-4 text-muted-foreground" />
                                        {apiKey.name}
                                    </div>
                                    <div>{apiKey.created}</div>
                                    <div className="flex items-center justify-between">
                                        <span>{apiKey.lastUsed}</span>
                                        <Button variant="ghost" size="icon">
                                            <MoreHorizontal className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="text-center py-12 border rounded-lg border-dashed">
                            <Key className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                            <h3 className="text-lg font-medium">No API keys found</h3>
                            <p className="text-muted-foreground mt-1">
                                Add a new API key to get started
                            </p>
                            <AddApiKeyDialog onAddApiKey={() => {}} className="mt-4" />
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}
