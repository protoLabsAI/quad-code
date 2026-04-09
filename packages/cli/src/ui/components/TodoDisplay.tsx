/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { Colors } from '../colors.js';

export interface TodoItem {
  id: string;
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
}

interface TodoDisplayProps {
  todos: TodoItem[];
}

export const TodoDisplay: React.FC<TodoDisplayProps> = ({ todos }) => {
  if (!todos || todos.length === 0) {
    return null;
  }

  return (
    <Box flexDirection="column">
      {todos.map((todo) => (
        <TodoItemRow key={todo.id} todo={todo} />
      ))}
    </Box>
  );
};

interface TodoItemRowProps {
  todo: TodoItem;
}

const TodoItemRow: React.FC<TodoItemRowProps> = ({ todo }) => {
  const isCompleted = todo.status === 'completed';
  const isInProgress = todo.status === 'in_progress';

  return (
    <Box flexDirection="row" minHeight={1}>
      {/* Status icon */}
      <Box width={3}>
        {isCompleted ? (
          <Text color={Colors.AccentGreen}>✓</Text>
        ) : (
          <Text color={Colors.Comment}>□</Text>
        )}
      </Box>

      {/* Content */}
      <Box flexGrow={1}>
        <Text
          color={
            isCompleted
              ? Colors.Comment
              : isInProgress
                ? Colors.AccentGreen
                : Colors.Foreground
          }
          strikethrough={isCompleted}
          wrap="wrap"
        >
          {todo.content}
        </Text>
      </Box>
    </Box>
  );
};
