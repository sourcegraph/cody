import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as vscode from 'vscode'

import { OnboardingExperimentArm } from '../chat/protocol'

import { localStorage } from './LocalStorageProvider'
import * as OnboardingExperiment from './OnboardingExperiment'

vi.mock('vscode', mockVScode)
vi.mock('./LocalStorageProvider', mockLocalStorage)
vi.mock('../log', mockLog)

function mockVScode() {
    return {
        UIKind: {
            Desktop: 1,
            Web: 42,
        },
        env: {
            uiKind: 1, // Desktop
        },
        workspace: {
            getConfiguration: () => ({
                get: () => undefined,
            }),
        },
    }
}

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
    const mockTelemetry = {
        log: vi.fn(),
    }

    beforeEach(() => {
        OnboardingExperiment.resetForTesting()
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('caches arms on exposure, not when picking them', async () => {
        const set = vi.spyOn(localStorage, 'set')
        OnboardingExperiment.pickArm(mockTelemetry)
        expect(set).not.toHaveBeenCalled()
        await OnboardingExperiment.logExposure()
        expect(set).toHaveBeenCalledWith('experiment.onboarding', '{"arm":1,"excludeFromExperiment":false}')
    })

    it('always assigns the treatment arm', () => {
        const random = vi.spyOn(global.Math, 'random')
        expect(OnboardingExperiment.pickArm(mockTelemetry)).toBe(OnboardingExperimentArm.Simplified)
        expect(random).not.toBeCalled()
    })

    it('caches the arm in memory once picked', () => {
        const localStorageGet = vi.spyOn(localStorage, 'get')
        const arm = OnboardingExperiment.pickArm(mockTelemetry)
        expect(localStorageGet).toBeCalled()

        localStorageGet.mockReset()
        expect(OnboardingExperiment.pickArm(mockTelemetry)).toBe(arm)
        expect(localStorageGet).not.toBeCalled()
    })

    it('logs exposures', async () => {
        vi.spyOn(global.Math, 'random').mockReturnValueOnce(-1)
        expect(OnboardingExperiment.pickArm(mockTelemetry)).toBe(OnboardingExperimentArm.Simplified)
        const log = vi.spyOn(mockTelemetry, 'log')
        await OnboardingExperiment.logExposure()
        expect(log).toHaveBeenCalledWith('CodyVSCodeExtension:experiment:simplifiedOnboarding:exposed', {
            arm: 'treatment',
            excludeFromExperiment: false,
        })
    })

    it('excludes users with cached control arms from the experiment', async () => {
        const localStorageGet = vi.spyOn(localStorage, 'get').mockReturnValue('{"arm":0,"excludeFromExperiment":false}')
        expect(OnboardingExperiment.pickArm(mockTelemetry)).toBe(OnboardingExperimentArm.Simplified)
        expect(localStorageGet).toBeCalled()

        const log = vi.spyOn(mockTelemetry, 'log')
        await OnboardingExperiment.logExposure()
        expect(log).toHaveBeenCalledWith('CodyVSCodeExtension:experiment:simplifiedOnboarding:exposed', {
            arm: 'treatment',
            excludeFromExperiment: true,
        })
    })

    it('excludes users with corrupt local storage', async () => {
        vi.spyOn(localStorage, 'get').mockReturnValue('"hi, mom"')
        expect(OnboardingExperiment.pickArm(mockTelemetry)).toBe(OnboardingExperimentArm.Simplified)

        const log = vi.spyOn(mockTelemetry, 'log')
        await OnboardingExperiment.logExposure()
        expect(log).toHaveBeenCalledWith('CodyVSCodeExtension:experiment:simplifiedOnboarding:exposed', {
            arm: 'treatment',
            excludeFromExperiment: true,
        })
    })

    it('can be overridden ON with a config parameter', async () => {
        vi.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue({
            get: (key: string) => key === 'testing.simplified-onboarding',
        } as unknown as vscode.WorkspaceConfiguration)
        const localStorageGet = vi.spyOn(localStorage, 'get')
        expect(OnboardingExperiment.pickArm(mockTelemetry)).toBe(OnboardingExperimentArm.Simplified)
        expect(localStorageGet).not.toBeCalled()

        const log = vi.spyOn(mockTelemetry, 'log')
        await OnboardingExperiment.logExposure()
        expect(log).not.toBeCalled()
    })

    it('can be overridden OFF with a config parameter', async () => {
        vi.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue({
            get: () => false,
        } as unknown as vscode.WorkspaceConfiguration)
        const localStorageGet = vi.spyOn(localStorage, 'get')
        expect(OnboardingExperiment.pickArm(mockTelemetry)).toBe(OnboardingExperimentArm.Classic)
        expect(localStorageGet).not.toBeCalled()

        const log = vi.spyOn(mockTelemetry, 'log')
        await OnboardingExperiment.logExposure()
        expect(log).not.toBeCalled()
    })

    it('does not log exposures from overrides', async () => {
        vi.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue({
            get: (key: string) => key === 'testing.simplified-onboarding',
        } as unknown as vscode.WorkspaceConfiguration)
        expect(OnboardingExperiment.pickArm(mockTelemetry)).toBe(OnboardingExperimentArm.Simplified)

        const log = vi.spyOn(mockTelemetry, 'log')
        await OnboardingExperiment.logExposure()
        expect(log).not.toBeCalled()
    })
})
