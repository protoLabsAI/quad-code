/**
 * @license
 * Copyright 2025 protoLabs Studio
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Box, Text } from 'ink';

export interface RecapMessageProps {
  text: string;
}

// U+203B (komejirushi) — same recap marker cc-2.18 uses for its
// "while you were away" card.
const RECAP_MARKER = '※';

const RecapMessageInternal: React.FC<RecapMessageProps> = ({ text }) => (
  <Box flexDirection="row" width="100%">
    <Box minWidth={2}>
      <Text dimColor>{RECAP_MARKER}</Text>
    </Box>
    <Text dimColor wrap="wrap">
      {text}
    </Text>
  </Box>
);

export const RecapMessage = React.memo(RecapMessageInternal);
