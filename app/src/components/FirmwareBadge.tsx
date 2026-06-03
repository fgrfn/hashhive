import { ArrowUpCircle } from 'lucide-react';
import { isFirmwareOutdated } from '../api';
import type { Theme } from '../tokens';
import type { FwLatest } from '../hooks/useFirmwareLatest';

/** Small "↑" marker shown next to a device's version when its firmware is
 *  behind the latest upstream release. Renders nothing when up to date. */
export function FwBadge({ t, current, family, fwLatest }: { t: Theme; current?: string; family: string; fwLatest: FwLatest }) {
  const fw = fwLatest[family];
  if (!fw || !isFirmwareOutdated(current, fw.version)) return null;
  return (
    <span title={`Update available → v${fw.version}`} style={{ display: 'inline-flex', alignItems: 'center', color: t.warning, marginLeft: 4 }}>
      <ArrowUpCircle size={11} />
    </span>
  );
}
