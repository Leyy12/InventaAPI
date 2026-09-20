export type ReviewState = { id: string; status: string; productId?: string | null };
type ReviewResult<T> =
  | { kind: 'success'; receipt: ReviewState }
  | { kind: 'conflict'; submission: T; message: string }
  | { kind: 'error'; message: string; retryable: boolean };

function statusOf(error: unknown): number | undefined {
  if (error && typeof error === 'object' && 'status' in error && typeof error.status === 'number') return error.status;
}

// One mutation only. A conflict is resolved by an authoritative read, never a replay.
export async function reviewSubmission<T extends ReviewState>({ id, decision, mutate, read, lock }: {
  id: string;
  decision: 'approve' | 'reject';
  mutate: () => Promise<ReviewState>;
  read: () => Promise<T>;
  lock: () => void;
}): Promise<ReviewResult<T>> {
  try {
    const receipt = await mutate();
    if (receipt.id !== id || receipt.status !== (decision === 'approve' ? 'approved' : 'rejected')) {
      throw new Error('Review response was uncertain. Refresh or retry the same action.');
    }
    return { kind: 'success', receipt };
  } catch (error) {
    const status = statusOf(error);
    if (status === 409) {
      lock();
      const message = error instanceof Error ? error.message : 'Submission state changed.';
      try {
        const submission = await read();
        if (submission.id !== id || !['submitted', 'approved', 'rejected'].includes(submission.status)) {
          throw new Error('Invalid authoritative submission response.');
        }
        return { kind: 'conflict', submission, message: `${message} Current state refreshed; your stale action was not applied.` };
      } catch {
        return { kind: 'error', retryable: false,
          message: `${message} Refresh failed. This row is locked until a successful refresh; no success is assumed.` };
      }
    }
    if (status === 401 || status === 403) {
      lock();
      return { kind: 'error', retryable: false,
        message: 'Review access denied. Check your sign-in and Admin permission, then refresh. The action was not confirmed.' };
    }
    return { kind: 'error', retryable: true,
      message: error instanceof Error ? error.message : 'Review outcome uncertain. Refresh or retry the same action.' };
  }
}
