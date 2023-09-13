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
        workspace: {
            getConfiguration: () => ({
                has: () => false,
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
        const random = vi.spyOn(global.Math, 'random').mockReturnValueOnce(2)
        const set = vi.spyOn(localStorage, 'set')
        OnboardingExperiment.pickArm(mockTelemetry)
        expect(set).not.toHaveBeenCalled()
        await OnboardingExperiment.logExposure()
        expect(set).toHaveBeenCalledWith('experiment.onboarding', '{"arm":0,"excludeFromExperiment":false}')
    })

    it('randomly assigns arms', () => {
        // The treatment arm has 0 allocation now, so return a number less than
        // zero.
        const random = vi.spyOn(global.Math, 'random').mockReturnValueOnce(-1)
        expect(OnboardingExperiment.pickArm(mockTelemetry)).toBe(OnboardingExperimentArm.Simplified)
        expect(random).toBeCalled()

        OnboardingExperiment.resetForTesting()
        random.mockReturnValueOnce(2)
        expect(OnboardingExperiment.pickArm(mockTelemetry)).toBe(OnboardingExperimentArm.Classic)
    })

    it('caches the arm in memory once picked', () => {
        const localStorageGet = vi.spyOn(localStorage, 'get')
        const random = vi.spyOn(global.Math, 'random')
        const arm = OnboardingExperiment.pickArm(mockTelemetry)
        expect(localStorageGet).toBeCalled()
        expect(random).toBeCalled()

        localStorageGet.mockReset()
        random.mockReset()
        expect(OnboardingExperiment.pickArm(mockTelemetry)).toBe(arm)
        expect(localStorageGet).not.toBeCalled()
        expect(random).not.toBeCalled()
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

    it('defers to arms cached in local storage', async () => {
        const localStorageGet = vi.spyOn(localStorage, 'get').mockReturnValue('{"arm":0,"excludeFromExperiment":true}')
        const random = vi.spyOn(global.Math, 'random')
        expect(OnboardingExperiment.pickArm(mockTelemetry)).toBe(OnboardingExperimentArm.Classic)
        expect(localStorageGet).toBeCalled()
        expect(random).not.toBeCalled()

        const log = vi.spyOn(mockTelemetry, 'log')
        await OnboardingExperiment.logExposure()
        expect(log).toHaveBeenCalledWith('CodyVSCodeExtension:experiment:simplifiedOnboarding:exposed', {
            arm: 'control',
            excludeFromExperiment: true,
        })
    })

    it('can be overridden with a config parameter, override exposures are not logged', async () => {
        vi.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue({
            has: (key: string) => key === 'testing.simplified-onboarding',
        } as unknown as vscode.WorkspaceConfiguration)
        const localStorageGet = vi.spyOn(localStorage, 'get')
        const random = vi.spyOn(global.Math, 'random')
        expect(OnboardingExperiment.pickArm(mockTelemetry)).toBe(OnboardingExperimentArm.Simplified)
        expect(localStorageGet).not.toBeCalled()
        expect(random).not.toBeCalled()

        const log = vi.spyOn(mockTelemetry, 'log')
        await OnboardingExperiment.logExposure()
        expect(log).not.toBeCalled()
    })
})
