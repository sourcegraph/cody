import { type HTMLAttributes, forwardRef } from 'react'

import { clsx } from 'clsx'
import upperFirst from 'lodash/upperFirst'

import type { ForwardReferenceComponent } from '../utils'

import styles from './Code.module.css'

enum TYPOGRAPHY_WEIGHTS {
    regular = 'regular',
    medium = 'medium',
    bold = 'bold',
}

const getFontWeightStyle = (weight: TYPOGRAPHY_WEIGHTS | `${TYPOGRAPHY_WEIGHTS}`): string =>
    clsx(styles[`fontWeight${upperFirst(weight)}` as keyof typeof styles])

interface CodeProps extends HTMLAttributes<HTMLElement> {
    size?: 'small' | 'base'
    weight?: TYPOGRAPHY_WEIGHTS | `${TYPOGRAPHY_WEIGHTS}`
}

export const Code = forwardRef(function Code(
    { children, as: Component = 'code', size, weight, className, ...props },
    reference
) {
    return (
        <Component
            className={clsx(
                styles.code,
                size === 'small' && styles.small,
                weight && getFontWeightStyle(weight),
                className
            )}
            ref={reference}
            {...props}
        >
            {children}
        </Component>
    )
}) as ForwardReferenceComponent<'code', CodeProps>
