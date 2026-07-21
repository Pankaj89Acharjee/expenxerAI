import { addCloudLog } from '@/src/services/userDataCloud';
import type { SplitGroup, SplitMember } from '@/src/types/models';

/** Write the same activity into every registered member's notification center. */
export async function notifySplitGroupMembers(
  group: Pick<SplitGroup, 'name' | 'members'>,
  title: string,
  message: string,
  type = 'SPLIT'
): Promise<void> {
  const targets = group.members.filter((m): m is SplitMember & { uid: string } => Boolean(m.uid));
  if (targets.length === 0) return;

  await Promise.all(
    targets.map((m) =>
      addCloudLog(m.uid, m.email ?? '', title, message, type).catch(() => {
        // Best-effort — one member failing should not block others.
      })
    )
  );
}
