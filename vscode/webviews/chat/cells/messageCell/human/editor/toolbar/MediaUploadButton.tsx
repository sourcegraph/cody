import type { ContextItemMedia } from '@sourcegraph/cody-shared'
import { ImageIcon } from 'lucide-react'
import type React from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { URI } from 'vscode-uri'
import { Button } from '../../../../../../components/shadcn/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '../../../../../../components/shadcn/ui/tooltip'
import type { SubmitButtonState } from './SubmitButton'

// Define allowed MIME types
const ALLOWED_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif']

interface UploadedImageInfo {
    id: string
    data: string
    filename: string
}

export const MediaUploadButton: React.FC<{
    onMediaUpload: (mediaContextItem: ContextItemMedia) => void
    submitState?: SubmitButtonState
    className?: string
    isEditorFocused?: boolean
}> = ({ onMediaUpload, submitState, className }) => {
    const [uploadedImages, setUploadedImages] = useState<UploadedImageInfo[]>([])
    const [errorMessage, setErrorMessage] = useState<string | null>(null)
    const submitBtnState = useRef<SubmitButtonState | undefined>(submitState)

    const fileInputRef = useRef<HTMLInputElement>(null)
    const uploadedIdsRef = useRef<Set<string>>(new Set())
    const buttonRef = useRef<HTMLButtonElement>(null)
    const dropZoneRef = useRef<HTMLDivElement>(null)

    // Create a ref to track the original onMediaUpload function
    const onMediaUploadRef = useRef(onMediaUpload)

    // Update the ref when the function changes
    useEffect(() => {
        onMediaUploadRef.current = onMediaUpload
    }, [onMediaUpload])

    // Effect to detect chat session changes (model changes indicate new chat) and clear state
    useEffect(() => {
        // If submitBtnState has changed, clear the state
        if (submitBtnState.current !== submitState) {
            // Reset all image-related state
            setUploadedImages([])
            setErrorMessage(null)
            uploadedIdsRef.current.clear()

            // Update the previous model ref
            submitBtnState.current = submitState
        }
    }, [submitState])

    // Effect to clear preview when submission occurs
    useEffect(() => {
        // If images were uploaded but now they're gone, a submission likely occurred
        if (uploadedImages.length === 0 && uploadedIdsRef.current.size > 0) {
            uploadedIdsRef.current.clear()
        }
    }, [uploadedImages])

    // Process a file and create a media context item
    const processImageFile = useCallback((file: File) => {
        // Validate file type
        if (!ALLOWED_MIME_TYPES.includes(file.type)) {
            setErrorMessage(
                `Unsupported file type ${file.type}. Supported types: PNG, JPEG, WEBP, HEIC, or HEIF.`
            )
            return
        }

        // Clear any previous error
        setErrorMessage(null)

        // Generate a filename with timestamp if file has no name
        const hasValidFileName = (name?: string) => name && !name?.startsWith('image.')
        const getFileName = () => `image-${Date.now()}.png`
        const filename = hasValidFileName(file.name) ? file.name : getFileName()
        const imageId = `img-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`

        // Process the file
        const reader = new FileReader()
        reader.onloadend = () => {
            const base64String = reader.result as string

            // Create a media context item
            const mediaItem = createMediaContextItem({
                uri: URI.file(filename),
                mimeType: file.type,
                filename,
                data: base64String,
                description: `Image: ${filename}`,
            })

            // Add to current list of uploaded images
            setUploadedImages(prev => {
                const newImages = [...prev, { id: imageId, data: base64String, filename }]
                return newImages
            })

            // Track the image ID
            uploadedIdsRef.current.add(imageId)

            // Send to parent component
            onMediaUploadRef.current(mediaItem)
        }
        reader.readAsDataURL(file)
    }, [])

    // Setup global paste event handler for images
    useEffect(() => {
        const handlePaste = (event: ClipboardEvent) => {
            const items = event.clipboardData?.items
            if (!items) return

            // Filter out non-image files
            for (const item of Array.from(items)) {
                // Check if item is an image
                if (item?.kind === 'file' && item?.type?.match('^image/')) {
                    const file = item.getAsFile()
                    if (file) {
                        processImageFile(file)
                        break // Only process the first image on paste
                    }
                }
            }
        }

        // Add global paste event listener
        document.addEventListener('paste', handlePaste)

        return () => {
            document.removeEventListener('paste', handlePaste)
        }
    }, [processImageFile])

    // Setup drag and drop handlers
    useEffect(() => {
        const handleDragOver = (event: DragEvent) => {
            event.preventDefault()
            event.stopPropagation()
        }

        const handleDrop = (event: DragEvent) => {
            event.preventDefault()
            event.stopPropagation()

            const files = []
            // Use DataTransferItemList interface
            if (event.dataTransfer?.items?.length) {
                files.push(
                    ...Array.from(event.dataTransfer.items)
                        .filter(item => item?.kind === 'file' && item?.type?.match('^image/'))
                        .map(item => item.getAsFile())
                )
            }

            if (event.dataTransfer?.files?.length) {
                files.push(...Array.from(event.dataTransfer.files))
            }

            for (const file of files) {
                if (file) {
                    processImageFile(file)
                }
            }
        }

        // Add event listeners to the document
        document.addEventListener('dragover', handleDragOver)
        document.addEventListener('drop', handleDrop)
        return () => {
            document.removeEventListener('dragover', handleDragOver)
            document.removeEventListener('drop', handleDrop)
        }
    }, [processImageFile])

    const handleFileChange = useCallback(
        (event: React.ChangeEvent<HTMLInputElement>) => {
            const files = event.target.files
            if (!files || files.length === 0) {
                return
            }

            // Process all selected files
            for (const file of Array.from(files)) {
                if (file.type.startsWith('image/')) {
                    processImageFile(file)
                }
            }

            // Reset the file input to allow selecting the same file again
            if (fileInputRef.current) {
                fileInputRef.current.value = ''
            }
        },
        [processImageFile]
    )

    const handleButtonClick = useCallback(() => {
        fileInputRef.current?.click()
    }, [])

    return (
        <div className="tw-inline-flex">
            <div ref={dropZoneRef} className="tw-inline-flex">
                <Tooltip delayDuration={0}>
                    <TooltipTrigger asChild>
                        <Button
                            variant="ghost"
                            size="none"
                            aria-label="Upload images"
                            ref={buttonRef}
                            className={className}
                        >
                            <ImageIcon
                                onClick={handleButtonClick}
                                className="tw-w-8 tw-h-8"
                                strokeWidth={1.25}
                            />
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">
                        {errorMessage ? (
                            <div className="tw-text-red-500">{errorMessage}</div>
                        ) : (
                            <div className="tw-text-center">
                                <div>Upload images (PNG, JPEG, WEBP, HEIC, HEIF)</div>
                                <div className="tw-text-sm tw-opacity-75 tw-mt-1">
                                    Copy and paste, or click to select
                                </div>
                                <div className="tw-text-sm tw-font-medium tw-text-primary tw-mt-2">
                                    Multiple images supported!
                                </div>
                            </div>
                        )}
                    </TooltipContent>
                    <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/heic,image/heif"
                        ref={fileInputRef}
                        style={{ display: 'none' }}
                        onChange={handleFileChange}
                        multiple
                    />
                </Tooltip>
            </div>
        </div>
    )
}

function createMediaContextItem(params: {
    uri: URI
    mimeType: string
    filename: string
    data: string
    description?: string
}): ContextItemMedia {
    return {
        type: 'media',
        title: params.filename,
        uri: params.uri,
        mimeType: params.mimeType,
        filename: params.filename,
        data: params.data,
        description: params.description,
        content: params.data,
        size: params.data.length,
    }
}
