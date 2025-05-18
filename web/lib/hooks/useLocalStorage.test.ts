import { renderHook, act } from '@testing-library/react'
import { describe, expect, it, beforeEach, vi } from 'vitest'
import { useLocalStorage } from './useLocalStorage'

describe('useLocalStorage', () => {
    // Mock localStorage
    const localStorageMock = (() => {
        let store: Record<string, string> = {}
        return {
            getItem: vi.fn((key: string) => store[key] || null),
            setItem: vi.fn((key: string, value: string) => {
                store[key] = value.toString()
            }),
            clear: vi.fn(() => {
                store = {}
            }),
        }
    })()

    // Replace the real localStorage with our mock
    Object.defineProperty(window, 'localStorage', { value: localStorageMock })

    beforeEach(() => {
        localStorageMock.clear()
        vi.clearAllMocks()
    })

    it('should use default value when localStorage is empty', () => {
        const { result } = renderHook(() => useLocalStorage('test-key', 'default-value'))
        expect(result.current[0]).toBe('default-value')
        expect(localStorageMock.getItem).toHaveBeenCalledWith('test-key')
    })

    it('should use value from localStorage when available', () => {
        localStorageMock.getItem.mockReturnValueOnce(JSON.stringify('stored-value'))
        const { result } = renderHook(() => useLocalStorage('test-key', 'default-value'))
        expect(result.current[0]).toBe('stored-value')
    })

    it('should update localStorage when value changes', () => {
        const { result } = renderHook(() => useLocalStorage('test-key', 'default-value'))
        
        act(() => {
            result.current[1]('new-value')
        })
        
        expect(result.current[0]).toBe('new-value')
        expect(localStorageMock.setItem).toHaveBeenCalledWith('test-key', JSON.stringify('new-value'))
    })

    it('should handle function updates correctly', () => {
        localStorageMock.getItem.mockReturnValueOnce(JSON.stringify(5))
        const { result } = renderHook(() => useLocalStorage<number>('counter', 0))
        
        act(() => {
            result.current[1](prev => prev + 1)
        })
        
        expect(result.current[0]).toBe(6)
        expect(localStorageMock.setItem).toHaveBeenCalledWith('counter', JSON.stringify(6))
    })

    it('should use default value when localStorage has invalid JSON', () => {
        localStorageMock.getItem.mockReturnValueOnce('invalid-json')
        const { result } = renderHook(() => useLocalStorage('test-key', 'default-value'))
        expect(result.current[0]).toBe('default-value')
    })
})