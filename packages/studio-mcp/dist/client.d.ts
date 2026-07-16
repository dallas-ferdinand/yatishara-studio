export declare function requireConfig(): {
    apiKey: string;
    apiUrl: string;
};
export declare function studioFetch(path: string, init?: RequestInit): Promise<unknown>;
export type GenerationJob = {
    id: string;
    status: string;
    error?: string | null;
    assets?: unknown[];
};
export declare function pollGeneration(jobId: string, options?: {
    intervalMs?: number;
    timeoutMs?: number;
}): Promise<GenerationJob>;
export declare function jsonResult(data: unknown): {
    content: {
        type: "text";
        text: string;
    }[];
};
