import { useEffect, useState } from 'react';
import { api } from '../api';

export type FwLatest = Record<string, { version: string; html_url: string }>;

/** Fetch the latest upstream firmware versions per family once (the backend
 *  caches for 6h, so this is cheap). Shared by the device list pages. */
export function useFirmwareLatest(): FwLatest {
  const [latest, setLatest] = useState<FwLatest>({});
  useEffect(() => {
    let alive = true;
    api.firmware.latest().then(d => { if (alive) setLatest(d); }).catch(() => {});
    return () => { alive = false; };
  }, []);
  return latest;
}
