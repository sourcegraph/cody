#!/usr/bin/env -S node
const URI = require('vscode-uri').URI

// All of these inputs are valid URLs that vscode-uri incorrectly handles.
const validURLs = [
  "https://example.com/?query=foo",
  "https://example.com/?query=foo+bar",
  "https://example.com/?query=foo&v=3",
  // This example escapes an = inside of the param
  "https://example.com/?query=foo%3Dbar",
]

for (const u of validURLs) {
  console.log("string", u)
  // For comparison, using the builtin URL class. This should always be the
  // same as u.
  console.log("url   ", new URL(u).toString())
  // The normal way we create a string from a URI in cody.
  console.log("vscode", URI.parse(u).toString())
  // For skip we set "skipEncoding" to true. This then breaks for when things
  // need to be encoded.
  console.log("skip  ", URI.parse(u).toString(true))
  console.log()
}

/*
  Current output:
  $ node uri-example.js
  string https://example.com/?query=foo
  url    https://example.com/?query=foo
  vscode https://example.com/?query%3Dfoo
  skip   https://example.com/?query=foo

  string https://example.com/?query=foo+bar
  url    https://example.com/?query=foo+bar
  vscode https://example.com/?query%3Dfoo%2Bbar
  skip   https://example.com/?query=foo+bar

  string https://example.com/?query=foo&v=3
  url    https://example.com/?query=foo&v=3
  vscode https://example.com/?query%3Dfoo%26v%3D3
  skip   https://example.com/?query=foo&v=3

  string https://example.com/?query=foo%3Dbar
  url    https://example.com/?query=foo%3Dbar
  vscode https://example.com/?query%3Dfoo%3Dbar
  skip   https://example.com/?query=foo=bar
*/
