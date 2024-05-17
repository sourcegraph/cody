import {
	type ContextMentionProviderMetadata,
	allMentionProvidersMetadata,
} from "@sourcegraph/cody-shared";
import { createContext, useContext, useEffect, useState } from "react";

/** React context data for the available context providers. */
export interface ContextProviderContext {
	providers:
		| Promise<ContextMentionProviderMetadata[]>
		| ContextMentionProviderMetadata[];
}

const context = createContext<ContextProviderContext>({
	providers: allMentionProvidersMetadata({
		experimentalNoodle: false,
		experimentalURLContext: false,
	}),
});

export const WithContextProviders = context.Provider;

export function useContextProviders(): ContextMentionProviderMetadata[] {
	const [resolvedProviders, setResolvedProviders] = useState<
		ContextMentionProviderMetadata[]
	>([]);
	const { providers: providerPromise } = useContext(context);

	useEffect(() => {
		void (async () => {
			const providers = await providerPromise;
			setResolvedProviders(providers);
		})();
	}, [providerPromise]);

	return resolvedProviders;
}
