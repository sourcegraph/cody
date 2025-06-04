import { type FC, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import styles from './ScrollbarMarkers.module.css'

// Simple debounce utility
function debounce<T extends (...args: any[]) => any>(func: T, wait: number): T {
    let timeout: number | undefined
    return ((...args: any[]) => {
        clearTimeout(timeout)
        timeout = window.setTimeout(() => func(...args), wait)
    }) as T
}

interface ScrollbarMarkersProps {
    scrollContainer: HTMLElement | null
}

interface Marker {
    type: 'user'
    elementIndex: number
    position: number
    textPreview: string
}

// Configuration constants
const MARKER_CONFIG = {
    HIDE_DELAY_MS: 1000,
    SCROLL_HIDE_DELAY_MS: 300,
    DEBOUNCE_UPDATE_MS: 50,
    DEBOUNCE_RESIZE_MS: 16,
    DEFAULT_SCROLLBAR_WIDTH: 15,
    MARKER_SIZE_PX: 8,
    CONTAINER_PADDING_PX: 20,
    MARKER_MARGIN_PERCENT: 5,
    MARKER_SCALE_FACTOR: 0.9,
    SCROLL_OFFSET_PX: 20,
    FADE_DURATION_MS: 300,
    MARKER_POSITION_PERCENT: 50,
} as const

export const ScrollbarMarkers: FC<ScrollbarMarkersProps> = ({ scrollContainer }) => {
    const [markers, setMarkers] = useState<Marker[]>([])
    const [containerRect, setContainerRect] = useState<DOMRect | null>(null)
    const [isScrollbarVisible, setIsScrollbarVisible] = useState(false)
    const [shouldShowMarkers, setShouldShowMarkers] = useState(false)
    const [isOverScrollbarArea, setIsOverScrollbarArea] = useState(false)
    const [isScrolling, setIsScrolling] = useState(false)
    const [scrollbarWidth, setScrollbarWidth] = useState<number>(MARKER_CONFIG.DEFAULT_SCROLLBAR_WIDTH)

    const hideTimeoutRef = useRef<number>()
    const cachedScrollbarWidthRef = useRef<number | null>(null)

    // Derived state for visibility conditions
    const canShowMarkers = useMemo(
        () => containerRect && isScrollbarVisible && (shouldShowMarkers || isScrolling),
        [containerRect, isScrollbarVisible, shouldShowMarkers, isScrolling]
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

    // Safe timeout management
    const clearHideTimeout = useCallback(() => {
        if (hideTimeoutRef.current !== undefined) {
            window.clearTimeout(hideTimeoutRef.current)
            hideTimeoutRef.current = undefined
        }
    }, [])

    const setHideTimeout = useCallback(
        (callback: () => void, delay: number) => {
            clearHideTimeout()
            hideTimeoutRef.current = window.setTimeout(callback, delay)
        },
        [clearHideTimeout]
    )

    // Detect scrollbar width with caching
    const detectScrollbarWidth = useCallback((): number => {
        if (cachedScrollbarWidthRef.current !== null) {
            return cachedScrollbarWidthRef.current
        }
        if (!scrollContainer) return MARKER_CONFIG.DEFAULT_SCROLLBAR_WIDTH

        try {
            const outer = document.createElement('div')
            outer.style.visibility = 'hidden'
            outer.style.overflow = 'scroll'
            document.body.appendChild(outer)

            const inner = document.createElement('div')
            outer.appendChild(inner)

            const measuredWidth = outer.offsetWidth - inner.offsetWidth
            document.body.removeChild(outer)

            cachedScrollbarWidthRef.current =
                measuredWidth > 0 ? measuredWidth : MARKER_CONFIG.DEFAULT_SCROLLBAR_WIDTH
            return cachedScrollbarWidthRef.current
        } catch {
            cachedScrollbarWidthRef.current = MARKER_CONFIG.DEFAULT_SCROLLBAR_WIDTH
            return cachedScrollbarWidthRef.current
        }
    }, [scrollContainer])

    // Update container dimensions and check scrollbar visibility
    const updateContainerDimensions = useCallback(() => {
        if (!scrollContainer) {
            setContainerRect(null)
            setIsScrollbarVisible(false)
            return
        }

        try {
            const newRect = scrollContainer.getBoundingClientRect()
            const newScrollbarVisible = scrollContainer.scrollHeight > scrollContainer.clientHeight

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

            setIsScrollbarVisible(prevVisible => {
                if (prevVisible !== newScrollbarVisible) {
                    if (newScrollbarVisible && (!prevVisible || cachedScrollbarWidthRef.current === null)) {
                        const newScrollbarWidth = detectScrollbarWidth()
                        setScrollbarWidth(newScrollbarWidth)
                    }
                    return newScrollbarVisible
                }
                return prevVisible
            })
        } catch {
            setContainerRect(null)
            setIsScrollbarVisible(false)
        }
    }, [scrollContainer, detectScrollbarWidth])

    // Find human message elements
    const findMessageElements = useCallback((): HTMLElement[] => {
        if (!scrollContainer) return []

        const elements = Array.from(
            scrollContainer.querySelectorAll('[data-role="human"]')
        ) as HTMLElement[]

        return elements.filter(element => element.getAttribute('data-role') === 'human')
    }, [scrollContainer])

    // Calculate marker position
    const calculateMarkerPosition = useCallback((element: HTMLElement, scrollHeight: number): number => {
        const parent = element.offsetParent as HTMLElement | null
        const elementTop =
            parent === scrollContainer
                ? element.offsetTop
                : element.offsetTop + (parent?.offsetTop || 0)

        const rawPosition = (elementTop / scrollHeight) * 100
        const position =
            MARKER_CONFIG.MARKER_MARGIN_PERCENT + rawPosition * MARKER_CONFIG.MARKER_SCALE_FACTOR

        return Math.min(
            100 - MARKER_CONFIG.MARKER_MARGIN_PERCENT,
            Math.max(MARKER_CONFIG.MARKER_MARGIN_PERCENT, position)
        )
    }, [scrollContainer])

    // Create markers from elements
    const createMarkersFromElements = useCallback(
        (messageElements: HTMLElement[], scrollHeight: number): Marker[] => {
            const newMarkers: Marker[] = []

            for (let i = 0; i < messageElements.length; i++) {
                const element = messageElements[i]
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
                    continue
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
                if (!scrollContainer) return

                try {
                    updateContainerDimensions()

                    let newMarkers: Marker[] = []

                    if (isScrollbarVisible) {
                        const messageElements = findMessageElements()

                        if (messageElements.length > 0) {
                            const scrollHeight = scrollContainer.scrollHeight

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
        [scrollContainer, isScrollbarVisible, updateContainerDimensions, findMessageElements, createMarkersFromElements]
    )

    // Handle container mouse move
    const handleContainerMouseMove = useCallback(
        (e: MouseEvent) => {
            if (!containerRect || !isScrollbarVisible) return

            const relativeX = e.clientX - containerRect.left
            const relativeY = e.clientY - containerRect.top

            const isInVerticalRange = relativeY >= 0 && relativeY <= containerRect.height
            const isInScrollbarArea =
                relativeX >= containerRect.width - scrollbarWidth && relativeX <= containerRect.width

            const wasOverScrollbar = isOverScrollbarArea
            const newIsOverScrollbarArea = isInVerticalRange && isInScrollbarArea
            setIsOverScrollbarArea(newIsOverScrollbarArea)

            if (newIsOverScrollbarArea && !wasOverScrollbar) {
                setShouldShowMarkers(true)
                clearHideTimeout()
                updateMarkers()
            } else if (!newIsOverScrollbarArea && wasOverScrollbar) {
                setHideTimeout(() => {
                    setShouldShowMarkers(false)
                }, MARKER_CONFIG.HIDE_DELAY_MS)
            }
        },
        [containerRect, isScrollbarVisible, scrollbarWidth, isOverScrollbarArea, clearHideTimeout, setHideTimeout, updateMarkers]
    )

    // Handle container mouse leave
    const handleContainerMouseLeave = useCallback(() => {
        if (isOverScrollbarArea) {
            setIsOverScrollbarArea(false)
            setHideTimeout(() => {
                setShouldShowMarkers(false)
            }, MARKER_CONFIG.HIDE_DELAY_MS)
        }
    }, [isOverScrollbarArea, setHideTimeout])

    // Handle marker hover
    const handleMarkerHover = useCallback(() => {
        clearHideTimeout()
        setShouldShowMarkers(true)
    }, [clearHideTimeout])

    // Handle marker leave
    const handleMarkerLeave = useCallback(() => {
        if (!isOverScrollbarArea) {
            setHideTimeout(() => {
                setShouldShowMarkers(false)
            }, MARKER_CONFIG.HIDE_DELAY_MS)
        }
    }, [isOverScrollbarArea, setHideTimeout])

    // Scroll to marker
    const scrollToMarker = useCallback(
        (index: number) => {
            if (!scrollContainer || index < 0 || index >= markers.length) return

            try {
                const marker = markers[index]
                const messageElements = scrollContainer.querySelectorAll('[data-role="human"]')

                if (marker.elementIndex < messageElements.length) {
                    const targetElement = messageElements[marker.elementIndex] as HTMLElement
                    if (targetElement) {
                        const parent = targetElement.offsetParent as HTMLElement | null
                        const elementTop =
                            parent === scrollContainer
                                ? targetElement.offsetTop
                                : targetElement.offsetTop + (parent?.offsetTop || 0)

                        scrollContainer.scrollTo({
                            top: Math.max(0, elementTop - MARKER_CONFIG.SCROLL_OFFSET_PX),
                            behavior: 'smooth',
                        })
                    }
                }
            } catch {
                // Silently fail
            }
        },
        [scrollContainer, markers]
    )

    // Set up event listeners and observers
    useEffect(() => {
        if (!scrollContainer) return

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

        // Scroll end detection
        const handleScrollEnd = debounce(() => {
            setIsScrolling(false)
        }, MARKER_CONFIG.SCROLL_HIDE_DELAY_MS)

        // Scroll handler
        const handleScroll = () => {
            if (!isScrolling) {
                setIsScrolling(true)
            }
            updateMarkers()
            handleScrollEnd()
        }

        // Mutation observer
        const mutationObserver = new MutationObserver(() => {
            updateMarkers()
        })

        try {
            resizeObserver.observe(scrollContainer)
            resizeObserver.observe(document.body)
            scrollContainer.addEventListener('scroll', handleScroll, { passive: true })
            scrollContainer.addEventListener('mousemove', handleContainerMouseMove, { passive: true })
            scrollContainer.addEventListener('mouseleave', handleContainerMouseLeave, { passive: true })
            mutationObserver.observe(scrollContainer, {
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
            scrollContainer.removeEventListener('scroll', handleScroll)
            scrollContainer.removeEventListener('mousemove', handleContainerMouseMove)
            scrollContainer.removeEventListener('mouseleave', handleContainerMouseLeave)
            clearHideTimeout()
            cachedScrollbarWidthRef.current = null
        }
    }, [
        scrollContainer,
        updateContainerDimensions,
        updateMarkers,
        handleContainerMouseMove,
        handleContainerMouseLeave,
        clearHideTimeout,
        isScrolling,
    ])

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
                        onMouseEnter={handleMarkerHover}
                        onMouseLeave={handleMarkerLeave}
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
