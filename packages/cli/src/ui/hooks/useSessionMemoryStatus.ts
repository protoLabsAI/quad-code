/**
 * @license
 * Copyright 2025 protoLabs
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { isExtractionInProgress } from '@qwen-code/qwen-code-core';

/**
 * Polls the session-memory extraction state every 500 ms and returns whether
 * the background notes agent is currently running.
 *
 * The polling interval is intentionally coarse — the extraction runs for
 * ~2-10 seconds so 500 ms gives a responsive indicator without burning renders.
 */
export function useSessionMemoryStatus(): { isExtracting: boolean } {
  const [isExtracting, setIsExtracting] = useState(false);

  useEffect(() => {
    const tick = () => setIsExtracting(isExtractionInProgress());
    tick(); // sync on mount

    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, []);

  return { isExtracting };
}
