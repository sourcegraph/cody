import { type MockInstance, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as vscode from 'vscode'

import { localStorage } from './LocalStorageProvider'
import * as OnboardingExperiment from './OnboardingExperiment'
import { telemetryService } from './telemetry'

import { OnboardingExperimentBranch } from './OnboardingExperiment'

//vi.mock('vscode', mockVScode)
vi.mock('./LocalStorageProvider', mockLocalStorage)
vi.mock('../log', mockLog)
// function mockVScode() {
//     return {
//         UIKind: {
//             Desktop: 1,
//             Web: 42,
//         },
//         env: {
//             uiKind: 1, // Desktop
//         },
//         workspace: {
//             getConfiguration: () => ({
//                 get: () => undefined,
//             }),
//         },
//     }
// }

function mockLog() {
    return {
        logDebug: () => {},
    }
}

function mockLocalStorage() {
    return {
        localStorage: {
            get: () => null,
            set: () => {},
        },
    }
}

describe('OnboardingExperiment', () => {
    let telemetryLogSpy: MockInstance
    beforeEach(() => {
        OnboardingExperiment.resetForTesting()
        telemetryLogSpy = vi.spyOn(telemetryService, 'log')
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('caches branches on exposure, not when picking them', async () => {
        vi.spyOn(global.Math, 'random').mockReturnValueOnce(2)
        const set = vi.spyOn(localStorage, 'set')
        OnboardingExperiment.pickBranch()
        expect(set).not.toHaveBeenCalled()
        await OnboardingExperiment.logExposure()
        expect(set).toHaveBeenCalledWith(
            'experiment.onboarding.removeAuthenticationStep',
            '{"branch":0,"excludeFromExperiment":false}'
        )
    })

    it('randomly assigns branches', () => {
        // A number less than zero will always trigger the experiment.
        const random = vi.spyOn(global.Math, 'random').mockReturnValueOnce(-1)
        expect(OnboardingExperiment.pickBranch()).toBe(
            OnboardingExperimentBranch.RemoveAuthenticationStep
        )
        expect(random).toBeCalled()

        OnboardingExperiment.resetForTesting()
        // A number greater than 1 will always trigger the control branch of the trial.
        random.mockReturnValueOnce(2)
        expect(OnboardingExperiment.pickBranch()).toBe(OnboardingExperimentBranch.Control)
    })

    it('caches the branch in memory once picked', () => {
        const localStorageGet = vi.spyOn(localStorage, 'get')
        const random = vi.spyOn(global.Math, 'random')
        const branch = OnboardingExperiment.pickBranch()
        expect(localStorageGet).toBeCalled()
        expect(random).toBeCalled()

        localStorageGet.mockReset()
        random.mockReset()
        expect(OnboardingExperiment.pickBranch()).toBe(branch)
        expect(localStorageGet).not.toBeCalled()
        expect(random).not.toBeCalled()
    })

    it('logs exposures', async () => {
        vi.spyOn(global.Math, 'random').mockReturnValueOnce(-1)
        expect(OnboardingExperiment.pickBranch()).toBe(
            OnboardingExperimentBranch.RemoveAuthenticationStep
        )
        await OnboardingExperiment.logExposure()
        expect(telemetryLogSpy).toHaveBeenCalledWith(
            'CodyVSCodeExtension:experiment:removeAuthenticationStep:exposed',
            {
                branch: 'treatment',
                excludeFromExperiment: false,
            }
        )
    })

    it('defers to branches cached in local storage', async () => {
        const localStorageGet = vi
            .spyOn(localStorage, 'get')
            .mockReturnValue('{"branch":0,"excludeFromExperiment":true}')
        const random = vi.spyOn(global.Math, 'random')
        expect(OnboardingExperiment.pickBranch()).toBe(OnboardingExperimentBranch.Control)
        expect(localStorageGet).toBeCalled()
        expect(random).not.toBeCalled()

        await OnboardingExperiment.logExposure()
        expect(telemetryLogSpy).toHaveBeenCalledWith(
            'CodyVSCodeExtension:experiment:removeAuthenticationStep:exposed',
            {
                branch: 'control',
                excludeFromExperiment: true,
            }
        )
    })

    it('can be overridden ON with a config parameter', async () => {
        vi.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue({
            get: (key: string) => key === 'cody.testing.removeAuthenticationStep',
        } as unknown as vscode.WorkspaceConfiguration)
        const localStorageGet = vi.spyOn(localStorage, 'get')
        const random = vi.spyOn(global.Math, 'random')
        expect(OnboardingExperiment.pickBranch()).toBe(
            OnboardingExperimentBranch.RemoveAuthenticationStep
        )
        expect(localStorageGet).not.toBeCalled()
        expect(random).not.toBeCalled()

        await OnboardingExperiment.logExposure()
        expect(telemetryLogSpy).not.toBeCalled()
    })

    it('can be overridden OFF with a config parameter', async () => {
        vi.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue({
            get: () => false,
        } as unknown as vscode.WorkspaceConfiguration)
        const localStorageGet = vi.spyOn(localStorage, 'get')
        const random = vi.spyOn(global.Math, 'random')
        expect(OnboardingExperiment.pickBranch()).toBe(OnboardingExperimentBranch.Control)
        expect(localStorageGet).not.toBeCalled()
        expect(random).not.toBeCalled()

        await OnboardingExperiment.logExposure()
        expect(telemetryLogSpy).not.toBeCalled()
    })

    it('does not log exposures from overrides', async () => {
        vi.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue({
            get: (key: string) => key === 'cody.testing.removeAuthenticationStep',
        } as unknown as vscode.WorkspaceConfiguration)
        expect(OnboardingExperiment.pickBranch()).toBe(
            OnboardingExperimentBranch.RemoveAuthenticationStep
        )

        await OnboardingExperiment.logExposure()
        expect(telemetryLogSpy).not.toBeCalled()
    })
})
