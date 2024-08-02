# Contributing to Cody Web

## Getting started

1. Run `pnpm install` (see [repository setup instructions](../doc/dev/index.md) if you don't have `pnpm`).
2. Go to the `/web` directory and run `pnpm build`

Tips: 
- Demo runs by default against `sourcegraph.com` instance 
(if you want to change it go to the `demo/App.tsx` and change `serverEndpoint` prop there)
- If it's not your first time running this demo check your local storage access token it might be outdated,
remove it and refresh the page 
- If you want to simulate the fresh run of Cody Web go to the IndexDB in your dev tools and remove all tables
related to localhost

## File structure

- `demo`: the minimal workable demo for Cody Web
- `lib`: the main source code of the Cody Web UI, built with Vite
- `dist`: build outputs from vite
- `index.html`: the entry file that Vite looks for to build the webviews. The extension host reads this file at run time and replace the variables inside the file with webview specific uri and info

## Architecture

Currently, Cody Web works on rails of Cody Agent and uses Chat UI from VSCode extension
So practically this means that any change in agent or in VSCode extension can break and change something in
Cody Web UX. Please test Cody Web manually before publishing it to the NPM (see testing section), at this stage cody web is a very 
fragile (we mostly rely on e2e and unit tests from VSCody and Cody agent packages, but later we'll have our own 
e2e tests against demo staging)  

## Testing

There are two ways to test Cody Web

- Running Cody Web and check basic functionality there (this helps during development phase)
- Building Cody Web package and linking it locally to Sourcegraph client, run Sourcegraph client and check 
Cody Web within Sourcegraph UI (this is highly recommended to do before publishing it to the NPM).
To do local linking you need to 
  - Make sure that your PR has updated version in cody web `package.json` and has related entry in `CHANGELOG.md`
  - Run `pnpm build` in `web` directory here in Cody repository
  - Run `pnpm link --global` 
  - Go to the Sourcegraph repository
  - Run `pnpm install` 
  - Specify updated `@sourcegraph/cody-web` package version in root sourcegraph `package.json`
  - Run `pnpm link @sourcegraph/cody-web --global`
  - After this run your sourcegraph bundler (there are set of commands to do this, usually it's just `sg start web-standalone`)
  
## Releases (publishing to NPM)

Currently, publishing is happening manually, means that you have to run `npm publish` from web directory
manually after you merged your PR to the Cody main, later it would be done with GH action. 

Cody Web package is published under `@sourcegraph/cody-web` (sourcegraph org on NPM).
To be able to publish packages there you have to be login in NPM under org account, 
you can find credentials to this account in 1pass (sourcegraph-npm-bot creds)

After you published your version of cody-web package to NPM make sure you update this version 
in Sourcegraph `package.json` and merge it to the main. 

## Development tips

- if you see some errors during pnpm build about shared or prompt packages make sure you build their most recent changes
  (to do this go to the package directory and run `pnpm build`)
- After you link your local package to Sourcegraph repo it may produce some TypeScript errors about react types in Sourcegraph
react components, this is because cody repo uses different version of react/react-dom types
- Currently due to CORS problems the demo doesn't work in Firefox

