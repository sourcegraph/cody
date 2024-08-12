function getFileName(filePath: string): string {
    return filePath.split('/').pop() || filePath
}
