import classNames from 'classnames'
import { type FunctionComponent, type ReactNode, useCallback, useState } from 'react'
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
    const [isKeyDown, setIsKeyDown] = useState(false)

    const suppressBlur = useCallback((e: React.MouseEvent<HTMLElement>): void => {
        e.stopPropagation()
        e.preventDefault()
    }, [])

    return (
        <div className={classNames(styles.container, FLOATING_WIDGET_CLASS_NAME, className)}>
            <ul
                className={styles.list}
                role="radiogroup"
                onKeyDown={e => {
                    setIsKeyDown(true)
                    if (e.key === 'Enter') {
                        onChange(value, true)
                        e.stopPropagation()
                        e.preventDefault()
                    }
                }}
                onKeyUp={() => setIsKeyDown(false)}
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
                                ref={el => {
                                    // Make arrow keys work correctly.
                                    if (el?.checked || (value === undefined && i === 0)) {
                                        // TODO!(sqs): the up/down arrows are broken if value === undefined, they should start at the 0'th element and down should go to the 1st
                                        setTimeout(() => el?.focus())
                                    }
                                }}
                                onChange={() => {
                                    const close = !isKeyDown
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
