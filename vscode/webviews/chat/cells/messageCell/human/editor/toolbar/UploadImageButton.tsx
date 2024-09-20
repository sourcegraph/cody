import { ImageIcon, XIcon } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { Button } from '../../../../../../components/shadcn/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '../../../../../../components/shadcn/ui/tooltip'

interface UploadImageButtonProps {
    className?: string
    imageFile?: File
    onClick: (file: File | undefined) => void
}

export const UploadImageButton = (props: UploadImageButtonProps) => {
    const fileInputRef = useRef<HTMLInputElement>(null)

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
                            {props.imageFile ? (
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
                    {props.imageFile
                        ? `Remove image (${props.imageFile.name})`
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
