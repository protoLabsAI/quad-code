/**
 * @license
 * Copyright 2025 protoLabs
 * SPDX-License-Identifier: Apache-2.0
 */

import { Box, Text } from 'ink';
import { theme } from '../semantic-colors.js';

interface TruncatedHistoryBannerProps {
  count: number;
}

/**
 * Shown at the top of the Static history window when older messages are no
 * longer included in the React tree (they have already been printed to the
 * terminal and do not need to be re-rendered).
 */
export const TruncatedHistoryBanner = ({
  count,
}: TruncatedHistoryBannerProps) => (
  <Box marginX={2} marginY={1}>
    <Text color={theme.text.secondary} dimColor>
      ─── {count} earlier message{count !== 1 ? 's' : ''} ───
    </Text>
  </Box>
);
