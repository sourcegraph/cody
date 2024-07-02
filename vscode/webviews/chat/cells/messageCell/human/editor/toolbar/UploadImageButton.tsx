import { ImageIcon, XIcon } from 'lucide-react'
import { Button } from '../../../../../../components/shadcn/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '../../../../../../components/shadcn/ui/tooltip'

export const UploadImageButton = ({
    className,
    uploadedImageUri,
    onClick,
}: { className?: string; uploadedImageUri?: string; onClick: () => void }) =>
    !uploadedImageUri ? (
        <Tooltip>
            <TooltipTrigger asChild>
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={onClick}
                    aria-label="Upload an image"
                    className={className}
                >
                    <ImageIcon className="tw-w-8 tw-h-8" strokeWidth={1.25} />
                </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Upload an image</TooltipContent>
        </Tooltip>
    ) : (
        <Tooltip>
            <TooltipTrigger asChild>
                <Button
                    variant="ghost"
                    size="sm"
                    aria-label="Upload an image"
                    className={className}
                    onClick={onClick}
                >
                    <span className="tw-max-w-[10em] tw-overflow-hidden tw-text-ellipsis" title="">
                        {uploadedImageUri ? uploadedImageUri.split(/[\/\\]/).pop() : ''}
                    </span>
                    <XIcon strokeWidth={1.25} className="tw-h-8 tw-w-8" />
                </Button>
            </TooltipTrigger>
            <TooltipContent>Remove attached image</TooltipContent>
        </Tooltip>
    )
