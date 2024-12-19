import {
	FeatureFlag,
	type SourcegraphGraphQLAPIClient,
	featureFlagProvider,
	storeLastValue,
} from "@sourcegraph/cody-shared";
import * as vscode from "vscode";

export class ChatIntentAPIClient {
	private featureCodyExperimentalOneBox = storeLastValue(
		featureFlagProvider.evaluatedFeatureFlag(
			FeatureFlag.CodyExperimentalOneBox,
		),
	);

	constructor(private readonly apiClient: SourcegraphGraphQLAPIClient) {}

	public dispose(): void {
		this.featureCodyExperimentalOneBox.subscription.unsubscribe();
	}

	public async detectChatIntent(interactionID: string, query: string) {
		if (!this.isIntentDetectionAPIEnabled()) {
			return;
		}
		return this.apiClient.chatIntent(interactionID, query);
	}

	private isIntentDetectionAPIEnabled(): boolean {
		if (
			vscode.workspace
				.getConfiguration()
				.get<boolean>("cody.internal.intentDetectionAPI")
		) {
			return true;
		}
		return !!this.featureCodyExperimentalOneBox.value.last;
	}
}
