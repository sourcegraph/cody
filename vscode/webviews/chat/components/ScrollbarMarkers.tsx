import { type FC, useCallback, useEffect, useMemo, useState } from 'react'
import styles from './ScrollbarMarkers.module.css'

// Simple debounce utility
function debounce<T extends (...args: any[]) => any>(func: T, wait: number): T {
    let timeout: number | undefined
    return ((...args: any[]) => {
        clearTimeout(timeout)
        timeout = window.setTimeout(() => func(...args), wait)
    }) as T
}

type ScrollbarMarkersProps = Record<string, never>

interface Marker {
    type: 'user'
    elementIndex: number
    position: number
    textPreview: string
}

// Configuration constants
const MARKER_CONFIG = {
    DEBOUNCE_UPDATE_MS: 50,
    DEBOUNCE_RESIZE_MS: 16,
    MARKER_SIZE_PX: 8,
    CONTAINER_PADDING_PX: 20,
    MARKER_MARGIN_PERCENT: 5,
    MARKER_SCALE_FACTOR: 0.9,
    SCROLL_OFFSET_PX: 40,
    MARKER_POSITION_PERCENT: 50,
} as const

export const ScrollbarMarkers: FC<ScrollbarMarkersProps> = () => {
    const [markers, setMarkers] = useState<Marker[]>([])
    const [containerRect, setContainerRect] = useState<DOMRect | null>(null)
    const [isScrollbarVisible, setIsScrollbarVisible] = useState(false)

    // Derived state for visibility conditions
    const canShowMarkers = useMemo(
        () => containerRect && isScrollbarVisible,
        [containerRect, isScrollbarVisible]
    )

    // Derived container positioning styles
    const containerStyles = useMemo(
        () =>
            containerRect
                ? {
                      top: `${containerRect.top}px`,
                      height: `${containerRect.height}px`,
                      right: '0px',
                      width: '20px',
                  }
                : null,
        [containerRect]
    )

    // Update container dimensions and check if content is scrollable
    const updateContainerDimensions = useCallback(() => {
        // Find the actual scrollable container (TabContainer with data-scrollable)
        const actualScrollContainer = document.querySelector('[data-scrollable]') as HTMLElement

        if (!actualScrollContainer) {
            setContainerRect(null)
            setIsScrollbarVisible(false)
            return
        }

        try {
            const newRect = actualScrollContainer.getBoundingClientRect()
            // Check if content is scrollable (scrollbars are hidden with CSS but content can still scroll)
            const isContentScrollable =
                actualScrollContainer.scrollHeight > actualScrollContainer.clientHeight

            setContainerRect(prevRect => {
                if (
                    !prevRect ||
                    prevRect.width !== newRect.width ||
                    prevRect.height !== newRect.height ||
                    prevRect.top !== newRect.top ||
                    prevRect.left !== newRect.left
                ) {
                    return newRect
                }
                return prevRect
            })

            setIsScrollbarVisible(isContentScrollable)
        } catch {
            setContainerRect(null)
            setIsScrollbarVisible(false)
        }
    }, [])

    // Find human message elements
    const findMessageElements = useCallback((): HTMLElement[] => {
        // Find the actual scrollable container (TabContainer with data-scrollable)
        const actualScrollContainer = document.querySelector('[data-scrollable]') as HTMLElement
        if (!actualScrollContainer) return []

        const elements = Array.from(
            actualScrollContainer.querySelectorAll('[data-role="human"]')
        ) as HTMLElement[]

        return elements.filter(element => element.getAttribute('data-role') === 'human')
    }, [])

    // Calculate marker position
    const calculateMarkerPosition = useCallback((element: HTMLElement, scrollHeight: number): number => {
        // Find the actual scrollable container (TabContainer with data-scrollable)
        const actualScrollContainer = document.querySelector('[data-scrollable]') as HTMLElement
        if (!actualScrollContainer) return 0

        const parent = element.offsetParent as HTMLElement | null
        const elementTop =
            parent === actualScrollContainer
                ? element.offsetTop
                : element.offsetTop + (parent?.offsetTop || 0)

        const rawPosition = (elementTop / scrollHeight) * 100
        const position =
            MARKER_CONFIG.MARKER_MARGIN_PERCENT + rawPosition * MARKER_CONFIG.MARKER_SCALE_FACTOR

        return Math.min(
            100 - MARKER_CONFIG.MARKER_MARGIN_PERCENT,
            Math.max(MARKER_CONFIG.MARKER_MARGIN_PERCENT, position)
        )
    }, [])

    // Create markers from elements
    const createMarkersFromElements = useCallback(
        (messageElements: HTMLElement[], scrollHeight: number): Marker[] => {
            const newMarkers: Marker[] = []

            // Remove the last marker since the last human message is always sticky at the bottom
            const elementsToProcess = messageElements.slice(0, -1)

            for (let i = 0; i < elementsToProcess.length; i++) {
                const element = elementsToProcess[i]
                if (!element) continue

                try {
                    const position = calculateMarkerPosition(element, scrollHeight)
                    const textContent = element.textContent?.trim() || ''
                    const textPreview =
                        textContent.length > 30 ? `${textContent.slice(0, 30)}...` : textContent

                    newMarkers.push({
                        type: 'user',
                        elementIndex: i,
                        position,
                        textPreview,
                    })
                } catch {
                    // Skip this element if position calculation fails
                }
            }

            return newMarkers
        },
        [calculateMarkerPosition]
    )

    // Update markers with debouncing
    const updateMarkers = useMemo(
        () =>
            debounce(() => {
                // Find the actual scrollable container (TabContainer with data-scrollable)
                const actualScrollContainer = document.querySelector('[data-scrollable]') as HTMLElement
                if (!actualScrollContainer) return

                try {
                    updateContainerDimensions()

                    let newMarkers: Marker[] = []

                    if (isScrollbarVisible) {
                        const messageElements = findMessageElements()

                        if (messageElements.length > 0) {
                            const scrollHeight = actualScrollContainer.scrollHeight

                            if (scrollHeight > 0) {
                                newMarkers = createMarkersFromElements(messageElements, scrollHeight)
                            }
                        }
                    }

                    setMarkers(newMarkers)
                } catch {
                    setMarkers([])
                }
            }, MARKER_CONFIG.DEBOUNCE_UPDATE_MS),
        [isScrollbarVisible, updateContainerDimensions, findMessageElements, createMarkersFromElements]
    )

    // Scroll to marker
    const scrollToMarker = useCallback(
        (index: number) => {
            // Find the actual scrollable container (TabContainer with data-scrollable)
            const actualScrollContainer = document.querySelector('[data-scrollable]') as HTMLElement
            if (!actualScrollContainer || index < 0 || index >= markers.length) return

            try {
                const marker = markers[index]
                const messageElements = actualScrollContainer.querySelectorAll('[data-role="human"]')

                if (marker.elementIndex < messageElements.length) {
                    const targetElement = messageElements[marker.elementIndex] as HTMLElement
                    if (targetElement) {
                        const parent = targetElement.offsetParent as HTMLElement | null
                        const elementTop =
                            parent === actualScrollContainer
                                ? targetElement.offsetTop
                                : targetElement.offsetTop + (parent?.offsetTop || 0)

                        actualScrollContainer.scrollTo({
                            top: Math.max(0, elementTop - MARKER_CONFIG.SCROLL_OFFSET_PX),
                            behavior: 'smooth',
                        })
                    }
                }
            } catch {
                // Silently fail
            }
        },
        [markers]
    )

    // Set up event listeners and observers
    useEffect(() => {
        // Find the actual scrollable container (TabContainer with data-scrollable)
        const actualScrollContainer = document.querySelector('[data-scrollable]') as HTMLElement
        if (!actualScrollContainer) return

        updateContainerDimensions()

        // Resize observer with debouncing
        const handleResize = debounce(() => {
            requestAnimationFrame(() => {
                try {
                    updateContainerDimensions()
                    updateMarkers()
                } catch {
                    // Silently handle errors
                }
            })
        }, MARKER_CONFIG.DEBOUNCE_RESIZE_MS)

        const resizeObserver = new ResizeObserver(entries => {
            if (entries.length > 0) {
                handleResize()
            }
        })

        // Scroll handler
        const handleScroll = () => {
            updateMarkers()
        }

        // Mutation observer
        const mutationObserver = new MutationObserver(() => {
            updateMarkers()
        })

        try {
            resizeObserver.observe(actualScrollContainer)
            resizeObserver.observe(document.body)
            actualScrollContainer.addEventListener('scroll', handleScroll, { passive: true })
            mutationObserver.observe(actualScrollContainer, {
                childList: true,
                subtree: true,
                attributes: false,
                characterData: false,
            })
        } catch {
            // Fallback if observers fail
            updateContainerDimensions()
            updateMarkers()
        }

        // Initial update
        updateMarkers()

        return () => {
            resizeObserver.disconnect()
            mutationObserver.disconnect()
            actualScrollContainer.removeEventListener('scroll', handleScroll)
        }
    }, [updateContainerDimensions, updateMarkers])

    if (!canShowMarkers || !containerStyles) {
        return null
    }

    return (
        <div
            className={styles.markerContainerWrapper}
            style={{
                position: 'fixed',
                top: containerStyles.top,
                right: containerStyles.right,
                width: containerStyles.width,
                height: containerStyles.height,
                pointerEvents: 'none',
                zIndex: 50,
            }}
        >
            <div
                className={styles.markerContainer}
                style={{
                    height: '100%',
                    width: '100%',
                    position: 'relative',
                    paddingTop: `${MARKER_CONFIG.CONTAINER_PADDING_PX}px`,
                    paddingBottom: `${MARKER_CONFIG.CONTAINER_PADDING_PX}px`,
                    pointerEvents: 'none',
                }}
            >
                {markers.map((marker, index) => (
                    <button
                        key={marker.elementIndex}
                        type="button"
                        className={styles.marker}
                        style={{
                            position: 'absolute',
                            left: `${MARKER_CONFIG.MARKER_POSITION_PERCENT}%`,
                            transform: `translateX(-${MARKER_CONFIG.MARKER_POSITION_PERCENT}%)`,
                            width: `${MARKER_CONFIG.MARKER_SIZE_PX}px`,
                            height: `${MARKER_CONFIG.MARKER_SIZE_PX}px`,
                            borderRadius: '50%',
                            cursor: 'pointer',
                            top: `${marker.position}%`,
                            border: 'none',
                            padding: 0,
                            pointerEvents: 'auto',
                            transition: 'all 0.15s ease-in-out',
                        }}
                        onClick={() => scrollToMarker(index)}
                        onKeyDown={e => e.key === 'Enter' && scrollToMarker(index)}
                        title={
                            marker.textPreview
                                ? `Scroll to '${marker.textPreview}'`
                                : 'Scroll to message'
                        }
                        aria-label={`User message at position ${index + 1}`}
                    />
                ))}
            </div>
        </div>
    )
}
