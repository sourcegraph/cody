declare module '*.module.css' {
    const classes: { readonly [key: string]: string }
    export default classes
}

declare module '*.svg?react' {
    // The path to the resource
    const component: React.ComponentType<React.SVGProps<SVGSVGElement>>
    export default component
}
