// Copied and modified from  https://github.com/nktnet1/kill-sync/blob/main/LICENSE

import { execSync } from 'node:child_process'

/**
 * Kills a process with the given PID.
 *
 * @param {number} pid - The process ID to kill.
 * @param {string | number} [signal='SIGTERM'] - signal to send to the process
 * @param {boolean} [recursive=false] - pass true for tree kill
 *
 * @returns {void}
 */
export function killSync(pid: number, signal?: string | number, recursive = false): void {
    signal = signal ?? 'SIGTERM'
    if (!recursive) {
        killPid(pid, signal)
        return
    }
    /* istanbul ignore next */
    switch (process.platform) {
        case 'win32':
            treeKillPowershell(pid)
            break
        //case 'darwin':
        default:
            treeKillUnix(pid, signal)
            break
    }
}

export function killChildrenSync(pid: number, signal?: string | number): void {
    signal = signal ?? 'SIGTERM'

    switch (process.platform) {
        case 'win32': {
            treeKillPowershell(pid, false)
            break
        }
        //case 'darwin':
        default:
            treeKillUnix(pid, signal, false)
            break
    }
}

type PpidMap = Record<number, number[]>

interface PidItem {
    pid: number
    ppid: number
}

/**
 * Retrieves a list of all running process IDs (PIDs) along with their parent
 * process IDs (PPIDs).
 *
 * @returns {PidItem[]} An array of PidItem objects containing PID and PPID.
 */
function getAllPids(): PidItem[] {
    return execSync('ps -A -o pid=,ppid=')
        .toString()
        .trim()
        .split('\n')
        .map((row: string) => {
            /* istanbul ignore next */
            const [, pid, ppid] = /\s*(\d+)\s*(\d+)/.exec(row) ?? []
            return {
                pid: Number(pid),
                ppid: Number(ppid),
            }
        })
}

/**
 * Retrieves all child PIDs of a given parent PID.
 *
 * @param {number} parentPid - The parent PID for which to find child PIDs.
 * @returns {number[]} An array of child PIDs.
 */
function getAllChilds(parentPid: number): number[] {
    const all = getAllPids()
    const ppidHash: PpidMap = all.reduce((hash: PpidMap, item) => {
        hash[item.ppid] = (hash[item.ppid] || []).concat(item.pid)
        return hash
    }, {})

    const result: number[] = []

    /**
     * Adds all children PIDs to the result array
     *
     * @param pid parent process ID of which to add children
     */
    const recursivelAddChild = (pid: number) => {
        ppidHash[pid] = ppidHash[pid] || []
        for (const childPid of ppidHash[pid]) {
            result.push(childPid)
            recursivelAddChild(childPid)
        }
    }
    recursivelAddChild(parentPid)
    return result
}

/**
 * Kills a process with the specified PID using the given signal.
 * The error ESRCH will be ignored.
 *
 * @param {number} pid - The PID of the process to be killed.
 * @param {number | string} signal - The signal to send for termination.
 */
function killPid(pid: number, signal: number | string) {
    try {
        process.kill(pid, signal)
    } catch (err: any) {
        if (err.code !== 'ESRCH') {
            throw err
        }
    }
}

/**
 * Recursively kills a process and all its child processes using the specified
 * signal - i.e. terminates the whole process tree.
 *
 * @param {number} pid - process pid to be killed alongside children.
 * @param {number | string} signal - the signal to send for termination.
 */
function treeKillUnix(pid: number, signal: string | number, includeSelf = true) {
    const childs = getAllChilds(pid)
    for (const childPid of childs) {
        killPid(childPid, signal)
    }
    if (includeSelf) {
        killPid(pid, signal)
    }
}

const treeKillPowershell = (pid: number, includeSelf = true) => {
    const script = /*ps1*/ `
        function Get-DescendantProcesses {
            param (
                [int]$ParentId
            )

            $children = Get-CimInstance Win32_Process | Where-Object { $_.ParentProcessId -eq $ParentId }
            $descendants = @()

            foreach ($child in $children) {
                $descendants += $child
                $descendants += Get-DescendantProcesses -ParentId $child.ProcessId
            }

            return $descendants
        }
        $scriptProcessId = $PID
        $targetProcessId = ${pid}
        $processesToKill = @()

        if ("${includeSelf ? 'true' : ''}") {
            $processesToKill += Get-Process -Id $targetProcessId -ErrorAction SilentlyContinue
        }

        $processesToKill += Get-DescendantProcesses -ParentId $targetProcessId

        foreach ($process in $processesToKill) {
            $processId = $_.ProcessId
            $processName = $_.Name

            if ($processId -eq $selfProcessId) { continue }

            # Try to stop the process normally
            Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue

            # Check if the process is still running
            if (Get-Process -Id $processId -ErrorAction SilentlyContinue) {
                Write-Host "Process $processId ($processName) didn't stop normally. Trying alternative methods..."

                # Try to terminate the process using WMI
                try {
                    (Get-WmiObject Win32_Process -Filter "ProcessId = $processId").Terminate()
                } catch {
                    Write-Host "WMI termination failed for $processId ($processName)"
                }

                # If still running, use taskkill
                if (Get-Process -Id $processId -ErrorAction SilentlyContinue) {
                    Write-Host "Using taskkill to forcefully terminate $processId ($processName)"
                    taskkill /F /PID $processId /T
                }
            }

            # Final check and cleanup
            Start-Sleep -Seconds 2  # Give some time for resources to be released
            if (-not (Get-Process -Id $processId -ErrorAction SilentlyContinue)) {
                Write-Host "Process $processId ($processName) has been terminated."

                # Additional cleanup steps
                [System.GC]::Collect()
                [System.GC]::WaitForPendingFinalizers()
            } else {
                Write-Host "WARNING: Process $processId ($processName) could not be terminated!"
            }
        }`

    return execSync(script, { shell: 'powershell.exe' })
}
