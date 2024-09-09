## Development

### Setup

1. Install [asdf](https://asdf-vm.com/)
1. Run `asdf install` (if needed, run `asdf plugin add NAME` for any missing plugins)
1. Run `pnpm install && pnpm build`

### Build and run the VS Code extension

Open this repository in VS Code and run the `Launch VS Code Extension (Desktop, recommended)` build/debug task (or run `pnpm -C vscode run dev`).

See [vscode/CONTRIBUTING.md](../../vscode/CONTRIBUTING.md) for more information.

### Other topics

- [Quality tools](quality/index.md)

### Tips

#### Use web build for quick UI iteration

As of Sept 2024, the quickest way to iterate on the chat UI is to run the web build:

```
pnpm -C web dev
```

By default, this will connect to sourcegraph.com, but you can also run it against a local instance by [modifying `serverEndpoint` in `App.tsx`](https://sourcegraph.com/github.com/sourcegraph/cody@c9e483df12dc7547dcdb19abece034c42e0f9039/-/blob/web/demo/App.tsx?L17-19)


#### Source maps

You can emit source maps by setting `sourcemap: true` in `vscode/webviews/vite.config.mts`. This helps with setting breakpoints in the webview.
