import classNames from 'classnames'
import { type FunctionComponent, type ReactNode, useCallback, useEffect, useRef } from 'react'
import { FLOATING_WIDGET_CLASS_NAME } from './FloatingWidget'
import styles from './SelectList.module.css'

type Value = string

export interface SelectListOption {
    value: Value | undefined
    title: string | ReactNode
    disabled?: boolean
}

export const SelectList: FunctionComponent<{
    options: SelectListOption[]
    value: string | undefined
    onChange: (value: Value | undefined, close: boolean) => void
    className?: string
}> = ({ options, value, onChange, className }) => {
    const isKeyDown = useRef(false)

    const suppressBlur = useCallback((e: React.MouseEvent<HTMLElement>): void => {
        e.stopPropagation()
        e.preventDefault()
    }, [])

    const ulRef = useRef<HTMLUListElement>(null)
    useEffect(() => {
        const checked = ulRef.current?.querySelector<HTMLInputElement>('label:has(input[checked])')
        const first = ulRef.current?.querySelector<HTMLInputElement>('label:first-child')
        setTimeout(() => (checked || first)?.focus())
    }, [])

    return (
        <div className={classNames(styles.container, FLOATING_WIDGET_CLASS_NAME, className)}>
            <ul
                className={styles.list}
                role="radiogroup"
                onKeyDown={e => {
                    isKeyDown.current = true
                    if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') {
                        onChange(value, true)
                        e.stopPropagation()
                        e.preventDefault()
                    }
                }}
                onKeyUp={() => {
                    isKeyDown.current = false
                }}
                ref={ulRef}
            >
                {options.map(({ value: optionValue, title }, i) => (
                    <li key={optionValue ?? 'none'}>
                        <label
                            className={styles.label}
                            // This onMouseDown handler is needed to prevent avoid the anchor button
                            // briefly losing focus after the user clicks on an item in a SelectList
                            // in the toolbar.
                            onMouseDown={suppressBlur}
                        >
                            <input
                                type="radio"
                                role="radio"
                                name="option"
                                value={optionValue}
                                checked={value === optionValue}
                                aria-checked={value === optionValue}
                                onChange={() => {
                                    // If onChange is called during keydown, then the user pressed
                                    // an arrow key. We want to keep the list open during arrow key
                                    // selection.
                                    const close = !isKeyDown.current
                                    onChange(optionValue, close)
                                }}
                            />
                            {title}
                        </label>
                    </li>
                ))}
            </ul>
        </div>
    )
}
