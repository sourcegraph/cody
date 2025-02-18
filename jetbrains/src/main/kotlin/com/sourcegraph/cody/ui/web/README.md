# Native Webviews in Cody for JetBrains

A "native" webview is one that runs web content&mdash;HTML, JavaScript and CSS. The Cody TypeScript extension calls the [VSCode Webview API.](https://code.visualstudio.com/api/extension-guides/webview) Agent's VSCode shim will proxy this API into Agent Protocol messages. This package sinks the Webview-related parts of the Agent protocol and forwards them to a service which provides the implementation of the API for JetBrains based on [JBCEF.](https://github.com/JetBrains/jcef)

The implementation is layered. The public layers are:
- [WebUIAgentBinding.kt](WebUIAgentBinding.kt) forwards the Webview-related Agent to client protocol to WebUIService.
- [WebUIService](WebUIService.kt) The Kotlin interface to the service.

Internally the package is also built in layers. From the lowest level up:
- [WebUIProxy](WebUIProxy.kt) Wraps a browser, handles details like how resource requests, postMessage, and transmitting theme colors are passed to the browser. This package uses JBCEF, but this is an implementation detail contained at this layer.
- [WebUIHost](WebUIHost.kt) abstracts some details of the host&mdash;which may be a side bar or an editor panel&mdash;from the WebUIProxy. Integrates the WebUIProxy with Cody Actions, IDE themes, interacts with Agent, etc.
- [WebviewView.kt](WebviewView.kt) (and related) implements the Webview view API by hosting WebUIProxy instances in Cody's Tool Window (although this is easy to generalize to other Tool Windows.)
- [WebviewPanel.kt](WebviewPanel.kt) (and related) implements the Webview panel API by hosting WebUIProxy instances in FileEditors.

## Agent Configuration

This package relies on Agent being configured with these client capabilities:

```json
{
  "webview": "native",  // Yes, we really run web content
  "webviewNativeConfig": {
    // Supports panels (in the editor area) and views (in Tool Windows)
    "view": "multiple",
    // See WebUIProxy.kt for details: Describes how we serve resources to the webview.
    "cspSource": "'self' https://*.sourcegraphstatic.com",
    "webviewBundleServingPrefix": "https://file+.sourcegraphstatic.com"
  },
  // postMessage is passed to/from Agent as a verbatim string, saving JSON parse+serialize.
  "webviewMessages": "String-encoded",
  ...
}
```
Hello World
