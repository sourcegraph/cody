package com.sourcegraph.cody.agent.protocol

data class ExecuteRecipeParams(
    var id: String, // TODO: make a string enum for RecipeID
    var humanChatInput: String,
    var data: Any? = null
)
