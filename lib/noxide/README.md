# @sourcegraph/cody-noxide

![Noxide Cover](docs/cover.jpg)

> **IMPORTANT NOTICE:** Because this is still an experimental feature it is not yet built
> automatically during CI. If you make changes to this library you MUST manually
> rebuild the library and commit the resulting `.node` and `.js/.d.ts` files.

## TLDR;

The Noxide library provides a set of high-performance and native
functions that would otherwise be difficult/impossible to implement in Node. It does this by binding a bit of Rust magic
(commnonly called oxidizing) the the Node.js runtime with
[napi-rs](https://napi.rs/). 

If you're a typescript-for-life fan; don't worry. You'd never even know you're now actually a Rust-developer (bragging rights included).
Because with `napi-rs` you can call Rust as if it's just a Typescript function.

## Why?

This library was originally created to experiment with the idea of creating a
set of fast and enterprise friendly (e.g. proxy, auth, etc.) fetch-like
functions. This way noxide could provide HTTP2/3 functionality with great proxy
support. Something Node's "built-in but ancient HTTP1.1" fetch nor the "newer
but unstable rewrite" Undici provide.

The node-api provides a very performant (no FFI serialization overhead) way to
call Rust code. Meaning noxide opens the door for implementing
performance-critical components (Jaccard-Similarity, Treesitter parsing, etc.)
in Rust and making them as easy to call from Typescript as any other NPM module. 

Rust doesn't just provide great performance boosts out of the box, but also a
fantastic ecosystem of crates for everything from optimzing performance (Rayon,
Salsa), networking (rustls), and AI (huggingface/candle, tiktoken-rs) that can
now trivially be integrated into TS.

>The name Noxide comes from combining Node and the term Oxidizing, a concept in
>the Rust community meaning "to add Rust to something". Noxide can be
>abbreviated as nox, otherwise known as nitrous oxide. You know...the stuff that
>makes the cars go fast and furious.

## Build / Dist

Because this is still experimental the build artifiacts (`node/*.node`) are simply committed to the repo. A future PR will add a probper CI and local dev with incremental debug builds.  

If you absolutely have to  modify this library (you likely don't...yet), you can simply run `bun dist` to cross-compile new libraries and commit the resulting files. Ping @RXminuS if you need some assistance.

```js
//TODO: @RXminuS add builds and local DX
```
Hello World
