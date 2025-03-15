function mergeSort(arr: number[]): number[] {
    if (arr.length <= 1) {
        return arr
    }

    const mid = Math.floor(arr.length / 2)
    const left = arr.slice(0, mid)
    const right = arr.slice(mid)

    return merge(mergeSort(left), mergeSort(right))
}

function merge(left: number[], right: number[]): number[] {
    let result: number[] = []
    let leftIndex = 0
    let rightIndex = 0

    while (leftIndex < left.length && rightIndex < right.length) {
        if (left[leftIndex] < right[rightIndex]) {
            result.push(left[leftIndex])
            leftIndex++
        } else {
            result.push(right[rightIndex])
            rightIndex++
        }
    }

    return result.concat(left.slice(leftIndex)).concat(right.slice(rightIndex))
}
