import * as vscode from 'vscode'

export enum LoginExperimentArm {
    Classic,
    Simplified,
}

export const LoginVariant: React.FunctionComponent<React.PropsWithoutRef<{}>> = () => {
    const isInsiders = vscode.env.uriScheme === 'vscode-insiders'
    const referralCode = isInsiders ? 'CODY_INSIDERS' : 'CODY'
    const signInRedirect = vscode.env.uriScheme + '://sourcegraph.cody-ai/code='

    return (
        <div>
            <p>
                <a
                    href={`https://sourcegraph.com/.auth/github/login?pc=https%3A%2F%2Fgithub.com%2F%3A%3Ae917b2b7fa9040e1edd4&redirect=/user/settings/tokens/new/callback%3frequestFrom=${referralCode}`}
                >
                    Sign In with GitHub
                </a>
            </p>
            <p>
                <a
                    href={`https://sourcegraph.com/.auth/gitlab/login?pc=https%3A%2F%2Fgitlab.com%2F%3A%3A262309265ae76179773477bd50c93c7022007a4810c344c69a7371da11949c48&redirect=/user/settings/tokens/new/callback%3frequestFrom=${referralCode}`}
                >
                    Sign In with Gitlab
                </a>
            </p>
            <p>
                <a href={`https://sourcegraph.com/sign-in?returnTo=${signInRedirect}&showMore=`}>
                    Continue with Email &rarr;
                </a>
            </p>
        </div>
    )
}
