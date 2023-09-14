export type AuthMethod = 'dotcom' | 'github' | 'gitlab' | 'google'

export enum OnboardingExperimentArm {
    Classic,
    Simplified,
    Default = Classic,
}
