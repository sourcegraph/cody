import { useEffect } from 'react'
import { getVSCodeAPI } from './VSCodeApi'

export function useDevicePixelRatioNotifier(): void {
    useEffect(() => {
        const updatePixelRatio = () => {
            getVSCodeAPI().postMessage({
                command: 'devicePixelRatio',
                devicePixelRatio: window.devicePixelRatio,
            })
        }

        updatePixelRatio()

        // Listen for changes in pixel ratio (e.g., zoom in/out)
        const mediaQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`)
        mediaQuery.addEventListener('change', updatePixelRatio)

        return () => mediaQuery.removeEventListener('change', updatePixelRatio)
    }, [])
}
