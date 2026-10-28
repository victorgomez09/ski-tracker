import { gzip, ungzip } from 'pako';

export interface PointPayload {
    lat: number;
    lon: number;
    altitude: number;
    speed: number;
    timestamp: string;
}

export interface CompressionResult {
    compressedBase64: string;
    originalBytes: number;
    compressedBytes: number;
    savingsPercent: number;
    savingsText: string;
}

/**
 * Converte Uint8Array a Base64 sin desbordamiento de pila para grandes arrays.
 */
export function uint8ArrayToBase64(bytes: Uint8Array): string {
    const CHUNK_SIZE = 0x8000; // 32KB chunks
    const chunks: string[] = [];
    for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
        const slice = bytes.subarray(i, i + CHUNK_SIZE);
        let str = '';
        for (let j = 0; j < slice.length; j++) {
            str += String.fromCharCode(slice[j]);
        }
        chunks.push(str);
    }
    const binary = chunks.join('');
    if (typeof btoa === 'function') {
        return btoa(binary);
    }
    const globalBuffer = (globalThis as any).Buffer;
    if (globalBuffer) {
        return globalBuffer.from(bytes).toString('base64');
    }
    return '';
}

/**
 * Descomprime un string Base64 gzippeado a texto UTF-8.
 */
export function decompressBase64Gzip(base64Str: string): string {
    let binary = '';
    if (typeof atob === 'function') {
        binary = atob(base64Str);
    } else {
        const globalBuffer = (globalThis as any).Buffer;
        if (globalBuffer) {
            binary = globalBuffer.from(base64Str, 'base64').toString('binary');
        }
    }
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    const decompressed = new TextDecoder().decode(ungzip(bytes));
    return decompressed;
}

/**
 * Comprime el array de puntos GPS usando Gzip de alta eficiencia para minimizar el consumo
 * de radio celular y preservar la batería en montaña.
 */
export function compressPointsPayload(points: PointPayload[]): CompressionResult {
    const rawJSON = JSON.stringify({ points });
    const originalBytes = new TextEncoder().encode(rawJSON).length;

    const gzippedBytes = gzip(rawJSON, { level: 9 });
    const compressedBytes = gzippedBytes.length;
    const compressedBase64 = uint8ArrayToBase64(gzippedBytes);

    const savingsPercent = originalBytes > 0
        ? Math.round(((originalBytes - compressedBytes) / originalBytes) * 100)
        : 0;

    return {
        compressedBase64,
        originalBytes,
        compressedBytes,
        savingsPercent,
        savingsText: `-${savingsPercent}% (${(originalBytes / 1024).toFixed(1)} KB → ${(compressedBytes / 1024).toFixed(1)} KB)`,
    };
}

/**
 * Divide un array de puntos en lotes homogéneos para subidas por partes en redes inestables.
 */
export function chunkPoints<T>(items: T[], chunkSize: number = 1000): T[][] {
    if (!items || items.length === 0) return [];
    if (chunkSize <= 0) return [items];
    const chunks: T[][] = [];
    for (let i = 0; i < items.length; i += chunkSize) {
        chunks.push(items.slice(i, i + chunkSize));
    }
    return chunks;
}
