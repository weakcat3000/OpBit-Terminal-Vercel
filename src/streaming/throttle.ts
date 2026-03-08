export function createRafBatcher<T>(
    onFlush: (items: T[]) => void
): (item: T) => void {
    let queue: T[] = [];
    let scheduled = false;

    return (item: T) => {
        queue.push(item);
        if (scheduled) return;
        scheduled = true;
        requestAnimationFrame(() => {
            const batch = queue;
            queue = [];
            scheduled = false;
            onFlush(batch);
        });
    };
}

export function nextBackoffMs(attempt: number): number {
    const capped = Math.min(attempt, 8);
    const base = Math.min(1000 * 2 ** capped, 30000);
    const jitter = Math.floor(Math.random() * 250);
    return base + jitter;
}

