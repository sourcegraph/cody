import { ImageIcon, XIcon } from 'lucide-react'
import { useRef } from 'react'
import { Button } from '../../../../../../components/shadcn/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '../../../../../../components/shadcn/ui/tooltip'

interface UploadImageButtonProps {
    className?: string
    imageFile?: File
    onClick: (file: File | undefined) => void
}

export const UploadImageButton = (props: UploadImageButtonProps) => {
    const fileInputRef = useRef<HTMLInputElement>(null)

    const handleButtonClick = () => {
        fileInputRef.current?.click()
    }

    const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0]
        props.onClick(file)
    }

    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <Button
                    variant="ghost"
                    size={props.imageFile ? 'sm' : 'icon'}
                    aria-label="Upload an image"
                    className={props.className}
                >
                    {props.imageFile ? (
                        <>
                            <span
                                className="tw-max-w-[10em] tw-overflow-hidden tw-text-ellipsis"
                                title={props.imageFile.name}
                            >
                                {props.imageFile.name}
                            </span>
                            <XIcon
                                strokeWidth={1.25}
                                className="tw-h-8 tw-w-8"
                                onClick={() => props.onClick(undefined)}
                            />
                        </>
                    ) : (
                        <ImageIcon
                            onClick={handleButtonClick}
                            className="tw-w-8 tw-h-8"
                            strokeWidth={1.25}
                        />
                    )}
                </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
                {props.imageFile ? 'Remove attached image' : 'Upload an image'}
            </TooltipContent>
            <input
                type="file"
                accept="image/*"
                ref={fileInputRef}
                style={{ display: 'none' }}
                onChange={handleFileChange}
            />
        </Tooltip>
    )
}
