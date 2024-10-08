import { useEffect, useRef } from 'react'

export function useTracePropsUpdate(props: any) {
    const prev = useRef(props)

    useEffect(() => {
        const changedProps = Object.entries(props).reduce(
            (ps, [k, v]) => {
                if (prev.current[k] !== v) {
                    ps[k] = [prev.current[k], v]
                }
                return ps
            },
            {} as Record<any, any>
        )

        if (Object.keys(changedProps).length > 0) {
            console.log('Changed props:', changedProps)
        }

        prev.current = props
    })
}
