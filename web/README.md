# Cody standalone web app

The `@sourcegraph/cody-web` package implements a standalone web app for Cody for development purposes only.

To run this standalone web app: `pnpm dev`, then open http://localhost:5777 and enter a Sourcegraph.com access token.

If the demo app doesn't load, it could be because there's an invalid token stored in local storage.

To clear the token, open the browser dev tools and run `localStorage.removeItem('accessToken')`.

**Status:** experimental (for development purposes only, not an end-user product)

The `@sourcegraph/cody-web` package implements a standalone web app for
Cody for development purposes only.

To run this standalone web app: `pnpm dev`, then open http://localhost:5777
and enter a Sourcegraph.com access token.

For now, it is OK to break this web app when making other changes to Cody
if it seems hard to support.
