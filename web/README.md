# Cody standalone web app

**Status:** experimental (currently is used by Sourcegraph Web client)

The `@sourcegraph/cody-web` package implements a standalone web app/components for Cody Web.

To run demo standalone web app: 
- Run `pnpm dev` 
- Then open http://localhost:5777 and enter a Sourcegraph.com access token.

If the demo app doesn't load, it could be because there's an invalid token stored in local storage
or in your IndexDB.

To clear the token, open the browser dev tools and run `localStorage.removeItem('accessToken')`.
To clear tokens in IndexDB, open browser dev tools and go to applications tab and clear 
IndexDB tables for http://localhost:5777 domain.

## How to run within Sourcegraph client 

- Build `@sourcegraph/cody-web` package by running `pnpm build`
- Register package local link with `pnpm link --global`
- Go to the Sourcegraph repository and create a link with `pnpm link @sourcegraph/cody-web --global`
- Run Sourcegraph `sg start` or `sg start web-standalone`

