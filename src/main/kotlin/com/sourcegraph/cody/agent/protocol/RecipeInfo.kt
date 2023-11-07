package com.sourcegraph.cody.agent.protocol

data class RecipeInfo(
    val id: String /* TODO: make a string enum for RecipeID */,
    val title: String
)
