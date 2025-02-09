/**
 * Normalizes file paths by removing the container path prefix
 * @param output The output string containing file paths
 * @param containerPath The container path to remove
 * @returns The normalized output with relative paths
 */
export function normalizeContainerPaths(output: string, containerPath: string): string {
    return output.replace(new RegExp(containerPath + '/?', 'g'), '');
} 
