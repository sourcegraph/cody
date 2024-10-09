import { useEffect, useRef } from 'react'

export function useTracePropsUpdate(props: any) {
    const prev = useRef(props)

    useEffect(() => {
        const changedProps = Object.entries(props).reduce(
            (prop, [k, v]) => {
                if (prev.current[k] !== v) {
                    prop[k] = [prev.current[k], v]
                }
                return prop
            },
            {} as Record<any, any>
        )

        if (Object.keys(changedProps).length > 0) {
            console.log('Changed props:', changedProps)
        }

        prev.current = props
    })
}
