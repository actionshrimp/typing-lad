import React, { useState } from "react";
import { Box, Text, useInput } from "ink";

const LOGO = `\
 \u2584\u2584\u2584\u2584\u2584\u2584\u2584 \u2584\u2584   \u2584\u2584 \u2584\u2584\u2584\u2584\u2584\u2584\u2584 \u2584\u2584\u2584 \u2584\u2584    \u2584 \u2584\u2584\u2584\u2584\u2584\u2584\u2584
\u2588       \u2588  \u2588 \u2588  \u2588       \u2588   \u2588  \u2588  \u2588 \u2588       \u2588
\u2588\u2584     \u2584\u2588  \u2588\u2584\u2588  \u2588    \u2584  \u2588   \u2588  \u2588\u2584\u2588 \u2588   \u2584\u2584\u2584\u2584\u2588
  \u2588   \u2588 \u2588       \u2588   \u2588\u2584\u2588 \u2588   \u2588       \u2588  \u2588  \u2584\u2584
  \u2588   \u2588 \u2588\u2584     \u2584\u2588    \u2584\u2584\u2584\u2588   \u2588  \u2584    \u2588  \u2588 \u2588  \u2588
  \u2588   \u2588   \u2588   \u2588 \u2588   \u2588   \u2588   \u2588 \u2588 \u2588   \u2588  \u2588\u2584\u2584\u2588 \u2588
  \u2588\u2584\u2584\u2584\u2588   \u2588\u2584\u2584\u2584\u2588 \u2588\u2584\u2584\u2584\u2588   \u2588\u2584\u2584\u2584\u2588\u2584\u2588  \u2588\u2584\u2584\u2588\u2584\u2584\u2584\u2584\u2584\u2584\u2584\u2588
 \u2584\u2584\u2584     \u2584\u2584\u2584\u2584\u2584\u2584\u2584 \u2584\u2584\u2584\u2584\u2584\u2584
\u2588   \u2588   \u2588       \u2588      \u2588
\u2588   \u2588   \u2588   \u2584   \u2588  \u2584    \u2588
\u2588   \u2588   \u2588  \u2588\u2584\u2588  \u2588 \u2588 \u2588   \u2588
\u2588   \u2588\u2584\u2584\u2584\u2588       \u2588 \u2588\u2584\u2588   \u2588
\u2588       \u2588   \u2584   \u2588       \u2588
\u2588\u2584\u2584\u2584\u2584\u2584\u2584\u2584\u2588\u2584\u2584\u2588 \u2588\u2584\u2584\u2588\u2584\u2584\u2584\u2584\u2584\u2584\u2588`;

type MenuItem = "practice" | "stats" | "quit";

const MENU_ITEMS: { label: string; value: MenuItem }[] = [
  { label: "Practice", value: "practice" },
  { label: "Stats", value: "stats" },
  { label: "Quit", value: "quit" },
];

interface MenuProps {
  onSelect: (item: MenuItem) => void;
}

export function Menu({ onSelect }: MenuProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  useInput((_input, key) => {
    if (key.upArrow) {
      setSelectedIndex((prev) =>
        prev <= 0 ? MENU_ITEMS.length - 1 : prev - 1
      );
    } else if (key.downArrow) {
      setSelectedIndex((prev) =>
        prev >= MENU_ITEMS.length - 1 ? 0 : prev + 1
      );
    } else if (key.return) {
      onSelect(MENU_ITEMS[selectedIndex].value);
    }
  });

  return (
    <Box flexDirection="column" alignItems="center" paddingTop={1}>
      <Text color="#7D56F4">{LOGO}</Text>
      <Box marginTop={1}>
        <Text color="#00CED1">Touch Typing Tutor</Text>
      </Box>
      <Box flexDirection="column" marginTop={1}>
        {MENU_ITEMS.map((item, index) => {
          const isSelected = index === selectedIndex;
          return (
            <Box key={item.value}>
              <Text bold={isSelected} color={isSelected ? "#7D56F4" : undefined}>
                {isSelected ? "\u25B8 " : "  "}
                {item.label}
              </Text>
            </Box>
          );
        })}
      </Box>
      <Box marginTop={1}>
        <Text color="#626262" dimColor>
          \u2191/\u2193 Navigate \u2022 Enter Select
        </Text>
      </Box>
    </Box>
  );
}
