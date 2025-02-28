import { type ContextItemMedia, type Model, ModelTag } from '@sourcegraph/cody-shared'
import clsx from 'clsx'
import { ImageIcon, XIcon } from 'lucide-react'
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
    model: Model
    submitState?: SubmitButtonState
}> = ({ onMediaUpload, model, submitState }) => {
    // Only works with BYOK and Vision models
    if (!model?.tags?.includes(ModelTag.BYOK) && !model?.tags?.includes(ModelTag.Vision)) {
        return null
    }
    const [uploadedImages, setUploadedImages] = useState<UploadedImageInfo[]>([])
    const [currentPreviewIndex, setCurrentPreviewIndex] = useState<number>(0)
    const [errorMessage, setErrorMessage] = useState<string | null>(null)
    const [isDragging, setIsDragging] = useState<boolean>(false)

    const fileInputRef = useRef<HTMLInputElement>(null)
    const uploadedIdsRef = useRef<Set<string>>(new Set())
    const buttonRef = useRef<HTMLButtonElement>(null)
    const dropZoneRef = useRef<HTMLDivElement>(null)
    const submitBtnState = useRef<SubmitButtonState | undefined>(submitState)

    // Create a ref to track the original onMediaUpload function
    const onMediaUploadRef = useRef(onMediaUpload)

    // Update the ref when the function changes
    useEffect(() => {
        onMediaUploadRef.current = onMediaUpload
    }, [onMediaUpload])

    // Effect to detect chat session changes (model changes indicate new chat) and clear state
    useEffect(() => {
        // If model ID changed, we're in a new chat session
        if (submitBtnState.current !== submitState) {
            // Reset all image-related state
            setUploadedImages([])
            setCurrentPreviewIndex(0)
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
                `Unsupported file type ${file.type}. Please upload one of the following: PNG, JPEG, WEBP, HEIC, or HEIF.`
            )
            return
        }

        // Clear any previous error
        setErrorMessage(null)

        // Generate a filename with timestamp if file has no name
        const filename = file.name || `image-${Date.now()}.png`
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
                setCurrentPreviewIndex(newImages.length - 1)
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

            for (const item of Array.from(items)) {
                // Check if item is an image
                if (item.type.startsWith('image/')) {
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
        const dropZone = dropZoneRef.current
        if (!dropZone) return

        const handleDragOver = (event: DragEvent) => {
            event.preventDefault()
            event.stopPropagation()
            setIsDragging(true)
        }

        const handleDragLeave = (event: DragEvent) => {
            event.preventDefault()
            event.stopPropagation()
            setIsDragging(false)
        }

        const handleDrop = (event: DragEvent) => {
            event.preventDefault()
            event.stopPropagation()
            setIsDragging(false)

            if (event.dataTransfer?.items) {
                // Use DataTransferItemList interface
                for (const item of Array.from(event.dataTransfer.items)) {
                    if (item.kind === 'file' && item.type.startsWith('image/')) {
                        const file = item.getAsFile()
                        if (file) {
                            processImageFile(file)
                        }
                    }
                }
            } else if (event.dataTransfer?.files) {
                // Use DataTransfer interface
                for (const file of Array.from(event.dataTransfer.files)) {
                    if (file.type.startsWith('image/')) {
                        processImageFile(file)
                    }
                }
            }
        }

        // Add event listeners to the dropZone element instead of document
        dropZone.addEventListener('dragover', handleDragOver)
        dropZone.addEventListener('dragleave', handleDragLeave)
        dropZone.addEventListener('drop', handleDrop)

        return () => {
            dropZone.removeEventListener('dragover', handleDragOver)
            dropZone.removeEventListener('dragleave', handleDragLeave)
            dropZone.removeEventListener('drop', handleDrop)
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
    const resetImageState = useCallback(() => {
        // Clear all images
        setUploadedImages([])
        setCurrentPreviewIndex(0)
        setErrorMessage(null)
        uploadedIdsRef.current.clear()

        // Reset the file input
        if (fileInputRef.current) {
            fileInputRef.current.value = ''
        }
    }, [])

    const handleClearImage = useCallback(
        (index?: number) => {
            if (index !== undefined) {
                // Remove specific image
                setUploadedImages(prev => {
                    const newImages = [...prev]
                    newImages.splice(index, 1)

                    // Adjust current preview index if needed
                    if (currentPreviewIndex >= newImages.length && newImages.length > 0) {
                        setCurrentPreviewIndex(newImages.length - 1)
                    } else if (newImages.length === 0) {
                        setCurrentPreviewIndex(0)
                    }

                    return newImages
                })
            } else {
                // Clear all images
                resetImageState()
            }

            setErrorMessage(null)
            if (fileInputRef.current) {
                fileInputRef.current.value = ''
            }
        },
        [currentPreviewIndex, resetImageState]
    )

    const handleButtonClick = useCallback(() => {
        fileInputRef.current?.click()
    }, [])

    // Compute current preview image
    const currentImage = uploadedImages.length > 0 ? uploadedImages[currentPreviewIndex] : null

    return (
        <>
            {/* Visible drop zone overlay when dragging */}
            {isDragging && (
                <div
                    className="tw-fixed tw-inset-0 tw-z-50 tw-bg-primary/20 tw-flex tw-items-center tw-justify-center"
                    style={{ pointerEvents: 'none' }}
                >
                    <div className="tw-bg-white tw-rounded-lg tw-p-8 tw-shadow-lg tw-text-center tw-animate-pulse">
                        <p className="tw-text-lg tw-font-medium tw-text-primary">Drop images here</p>
                        <p className="tw-text-sm tw-mt-2">You can upload multiple files at once</p>
                        <div className="tw-flex tw-items-center tw-justify-center tw-gap-2 tw-mt-3">
                            <ImageIcon className="tw-w-6 tw-h-6 tw-text-primary" />
                            <ImageIcon className="tw-w-6 tw-h-6 tw-text-primary" />
                            <ImageIcon className="tw-w-6 tw-h-6 tw-text-primary" />
                        </div>
                    </div>
                </div>
            )}

            <div
                ref={dropZoneRef}
                className={clsx(
                    'tw-relative',
                    isDragging && 'tw-ring-2 tw-ring-primary tw-rounded-lg tw-p-1'
                )}
            >
                <Tooltip delayDuration={0}>
                    <TooltipTrigger asChild>
                        <Button
                            variant={uploadedImages.length > 0 ? 'ghost' : 'outline'}
                            size={uploadedImages.length > 0 ? 'sm' : 'icon'}
                            aria-label="Upload images (drag, select, or paste with Cmd+V)"
                            ref={buttonRef}
                            className={clsx(
                                'tw-relative',
                                !uploadedImages.length &&
                                    'tw-border-dashed hover:tw-border-primary hover:tw-bg-primary/5'
                            )}
                            onClick={handleButtonClick}
                        >
                            <ImageIcon className="tw-w-8 tw-h-8" strokeWidth={1.25} />
                            {uploadedImages.length > 1 && (
                                <span className="tw-absolute -tw-top-2 -tw-right-2 tw-bg-primary tw-text-white tw-rounded-full tw-w-5 tw-h-5 tw-flex tw-items-center tw-justify-center tw-text-xs">
                                    {uploadedImages.length}
                                </span>
                            )}
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">
                        {currentImage ? (
                            <div className="tw-relative tw-max-w-xs">
                                <img
                                    src={currentImage.data}
                                    alt={`Uploaded Preview: ${currentImage.filename}`}
                                    className="tw-max-w-xs tw-h-auto"
                                />
                                <Button
                                    onClick={() => handleClearImage(currentPreviewIndex)}
                                    className="tw-absolute -tw-top-2 -tw-right-2 tw-bg-red-500 tw-text-white tw-rounded-full tw-p-0.5 focus:tw-outline-none focus:tw-ring-2 focus:tw-ring-red-500"
                                    aria-label="Remove Image"
                                >
                                    <XIcon strokeWidth={1.25} className="tw-h-8 tw-w-8" />
                                </Button>

                                {/* Image navigation if multiple images */}
                                {uploadedImages.length > 1 && (
                                    <div className="tw-absolute -tw-bottom-8 tw-left-0 tw-right-0 tw-flex tw-justify-center tw-items-center tw-gap-2">
                                        {uploadedImages.map((_, idx) => (
                                            <button
                                                key={`${
                                                    // biome-ignore lint/suspicious/noArrayIndexKey: <explanation>
                                                    idx
                                                }-preview`}
                                                onClick={() => setCurrentPreviewIndex(idx)}
                                                className={`tw-w-2 tw-h-2 tw-rounded-full ${
                                                    idx === currentPreviewIndex
                                                        ? 'tw-bg-primary'
                                                        : 'tw-bg-gray-300'
                                                }`}
                                                type="button"
                                                aria-label={`View image ${idx + 1}`}
                                            />
                                        ))}
                                        {uploadedImages.length > 1 && (
                                            <Button
                                                onClick={() => handleClearImage()}
                                                className="tw-text-xs tw-ml-2 tw-text-red-500"
                                                variant="link"
                                                size="sm"
                                            >
                                                Clear all
                                            </Button>
                                        )}
                                    </div>
                                )}
                            </div>
                        ) : errorMessage ? (
                            <div className="tw-text-red-500">{errorMessage}</div>
                        ) : (
                            <div className="tw-text-center">
                                <div>Upload images (PNG, JPEG, WEBP, HEIC, HEIF)</div>
                                <div className="tw-text-sm tw-opacity-75 tw-mt-1">
                                    Drag & drop, paste Cmd+V, or click to select
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
        </>
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
        size: params.data.length,
    }
}
