/**
 * Extracts clean domain and generates a high-resolution favicon URL via Google Favicons API
 */
export function getResortLogoUrl(website?: string | null, size: number = 256): string | null {
    if (!website || typeof website !== 'string') return null;

    try {
        const trimmed = website.trim();
        if (!trimmed) return null;

        const withProto = trimmed.startsWith('http://') || trimmed.startsWith('https://')
            ? trimmed
            : `https://${trimmed}`;

        const url = new URL(withProto);
        const hostname = url.hostname.toLowerCase().replace(/^www\./, '');
        if (!hostname || !hostname.includes('.')) return null;

        return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=${size}`;
    } catch {
        return null;
    }
}
