import { useExtensionAPI, useObservable } from '@sourcegraph/prompt-editor'
import { useMemo, useState } from 'react'
import { Input } from '../../../../components/shadcn/ui/input'
import { Tooltip, TooltipContent, TooltipTrigger } from '../../../../components/shadcn/ui/tooltip'
import { useDebounce } from '../../../../utils/useDebounce'

interface IProps {
    onSelect: (repo: { name: string; id: string }) => void
}

export const RepositorySelector = ({ onSelect }: IProps) => {
    const [query, setQuery] = useState('')
    const debouncedQuery = useDebounce(query, 300)

    const extensionsAPI = useExtensionAPI()
    const repos = useObservable(
        useMemo(
            () => extensionsAPI.repos({ first: 20, query: debouncedQuery }),
            [extensionsAPI, debouncedQuery]
        )
    )

    const [open, setOpen] = useState(false)

    return (
        <div className="tw-relative" onFocus={() => setOpen(true)} onBlur={() => setOpen(false)}>
            <Input
                placeholder="Filter repository"
                value={query}
                onChange={e => {
                    setOpen(true)
                    setQuery(e.target.value)
                }}
                className="!tw-bg-background !tw-text-foreground !tw-border-border !tw-ring-offset-background !tw-py-4 !tw-px-4 !tw-h-14 !tw-text-sm"
            />

            {open && (
                <div
                    onMouseDown={e => e.preventDefault()}
                    className="tw-w-[100%] tw-mt-4 tw-absolute tw-top-10 tw-left-0 tw-bg-background tw-text-foreground tw-border tw-border-border tw-rounded-md tw-shadow-md tw-overflow-y-auto tw-max-h-[300px]"
                >
                    {repos.value?.map(repo => (
                        <Tooltip key={repo.id}>
                            <TooltipTrigger asChild>
                                <div
                                    key={repo.id}
                                    onClick={() => {
                                        onSelect(repo)
                                        setOpen(false)
                                    }}
                                    className="tw-text-ellipsis !tw-line-clamp-1 tw-px-4 tw-py-2 tw-overflow-hidden hover:tw-bg-button-background-hover hover:tw-text-button-foreground tw-justify-between tw-items-center tw-cursor-pointer"
                                    role="button"
                                    onKeyDown={e => {
                                        if (e.key === 'Enter') {
                                            onSelect(repo)
                                            setOpen(false)
                                        }
                                    }}
                                >
                                    {repo.name}
                                </div>
                            </TooltipTrigger>
                            <TooltipContent>{repo.name}</TooltipContent>
                        </Tooltip>
                    ))}
                    {!repos.value?.length && <div className="tw-p-4">No repositories found</div>}
                </div>
            )}
        </div>
    )
}
