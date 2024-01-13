import React from 'react'

export const CodySvg = React.memo<{ className?: string }>(function CodySvg({ className }) {
    return (
        <svg
            version="1.0"
            xmlns="http://www.w3.org/2000/svg"
            width="30"
            height="30"
            viewBox="0 0 128 128"
            className={className}
        >
            <g transform="translate(0,128) scale(0.100000,-0.100000)" fill="currentColor">
                <path
                    d="M832 1126 c-52 -28 -62 -61 -62 -199 0 -150 11 -186 67 -212 48 -23
        99 -14 138 25 l30 30 3 135 c4 151 -8 194 -59 220 -34 18 -86 19 -117 1z"
                />
                <path
                    d="M219 967 c-45 -30 -63 -83 -46 -134 7 -23 25 -46 46 -60 31 -21 45
        -23 163 -23 175 0 218 24 218 120 0 96 -43 120 -218 120 -118 0 -132 -2 -163
        -23z"
                />
                <path
                    d="M977 503 c-40 -38 -96 -80 -123 -95 -185 -100 -409 -68 -569 83 -56
        52 -82 63 -124 54 -50 -11 -81 -51 -81 -104 0 -44 3 -49 73 -116 137 -132 305
        -192 511 -182 186 9 308 62 446 193 83 80 85 83 85 129 0 40 -5 51 -33 76 -24
        22 -42 29 -72 29 -36 0 -48 -8 -113 -67z"
                />
            </g>
        </svg>
    )
})

export const SubmitSvg = React.memo<{ className?: string }>(function CodySvg({ className }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="currentColor"
            className={className}
        >
            <path d="m21.426 11.095-17-8A1 1 0 0 0 3.03 4.242l1.212 4.849L12 12l-7.758 2.909-1.212 4.849a.998.998 0 0 0 1.396 1.147l17-8a1 1 0 0 0 0-1.81z" />
        </svg>
    )
})
