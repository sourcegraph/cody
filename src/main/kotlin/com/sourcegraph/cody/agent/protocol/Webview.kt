package com.sourcegraph.cody.agent.protocol

data class WebviewCreateWebviewPanelPortMapping(val webviewPort: Int, val extensionHostPort: Int)

data class WebviewOptions(
    val enableScripts: Boolean,
    val enableForms: Boolean,
    // boolean | readonly string[]
    val enableCommandUris: Any,
    // Note, we model "missing" here because interpreting the default
    // depends on the current workspace root.
    val localResourceRoots: List<String>,
    val portMapping: List<WebviewCreateWebviewPanelPortMapping>,
    val enableFindWidget: Boolean,
    val retainContextWhenHidden: Boolean,
)

data class WebviewCreateWebviewPanelShowOptions(
    val preserveFocus: Boolean,
    val viewColumn: Int,
)

data class WebviewCreateWebviewPanelParams(
    val handle: String,
    val viewType: String,
    val title: String,
    val showOptions: WebviewCreateWebviewPanelShowOptions,
    val options: WebviewOptions
)
