import { ImageIcon, XIcon } from 'lucide-react'

import { useEffect, useRef, useState } from 'react'

import { Button } from '../../../../../../components/shadcn/ui/button'

import { Tooltip, TooltipContent, TooltipTrigger } from '../../../../../../components/shadcn/ui/tooltip'

interface UploadImageButtonProps {
    className?: string

    imageFile?: File

    onClick: (file: File | undefined) => void

    submitting?: boolean
}

export const UploadImageButton = (props: UploadImageButtonProps) => {
    const fileInputRef = useRef<HTMLInputElement>(null)

    // Use local state to persist the uploaded file while submission is in progress.

    const [persistedFile, setPersistedFile] = useState<File | undefined>(props.imageFile)

    useEffect(() => {
        // When not submitting, update persistedFile to the current imageFile.

        // When submitting, we do not want to clear the value even if props.imageFile is now undefined.

        if (!props.submitting) {
            setPersistedFile(props.imageFile)
        }
    }, [props.imageFile, props.submitting])

    // During submission, use the persisted file so that the blue image remains visible.

    const displayFile = props.submitting ? persistedFile : props.imageFile

    useEffect(() => {
        const handlePaste = async (event: ClipboardEvent) => {
            const items = event.clipboardData?.items

            if (!items) return

            for (const item of items) {
                if (item.type.startsWith('image/')) {
                    const file = item.getAsFile()

                    if (file) {
                        props.onClick(file)

                        break
                    }
                }
            }
        }

        window.addEventListener('paste', handlePaste)

        return () => window.removeEventListener('paste', handlePaste)
    }, [props])

    const handleButtonClick = () => {
        fileInputRef.current?.click()
    }

    const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0]

        props.onClick(file)
    }

    return (
        <div className="tw-relative">
            <Tooltip>
                <TooltipTrigger asChild>
                    <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Upload an image or paste from clipboard"
                        className={props.className}
                        onClick={handleButtonClick}
                    >
                        <div className="tw-flex tw-items-center tw-gap-2">
                            {displayFile ? (
                                <>
                                    <ImageIcon
                                        className="tw-w-6 tw-h-6 tw-text-blue-600"
                                        strokeWidth={2}
                                    />

                                    <XIcon
                                        strokeWidth={2}
                                        className="tw-h-6 tw-w-6 hover:tw-text-red-500 tw-transition-colors"
                                        onClick={e => {
                                            e.stopPropagation()

                                            setPersistedFile(undefined)

                                            props.onClick(undefined)
                                        }}
                                    />
                                </>
                            ) : (
                                <ImageIcon
                                    className="tw-w-6 tw-h-6 tw-text-muted-foreground"
                                    strokeWidth={1.5}
                                />
                            )}
                        </div>
                    </Button>
                </TooltipTrigger>

                <TooltipContent side="bottom">
                    {displayFile
                        ? `Remove image (${displayFile.name})`
                        : 'Upload an image or paste (Ctrl+V)'}
                </TooltipContent>
            </Tooltip>

            <input
                type="file"
                accept="image/*"
                ref={fileInputRef}
                className="tw-hidden"
                onChange={handleFileChange}
            />
        </div>
    )
}
