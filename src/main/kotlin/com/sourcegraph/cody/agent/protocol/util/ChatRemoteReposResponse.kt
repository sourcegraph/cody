package com.sourcegraph.cody.agent.protocol.util

import com.sourcegraph.cody.agent.protocol.Repo

data class ChatRemoteReposResponse(val remoteRepos: List<Repo>)
