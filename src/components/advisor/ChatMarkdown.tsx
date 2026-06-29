import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { ReactNode } from 'react';

interface ChatMarkdownProps {
  text: string;
  textColor: string;
  mutedColor: string;
  accentColor: string;
  codeBackground: string;
}

type Block =
  | { type: 'heading'; level: 1 | 2 | 3; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'bullet'; text: string }
  | { type: 'ordered'; index: number; text: string }
  | { type: 'code'; text: string }
  | { type: 'blockquote'; text: string }
  | { type: 'table'; headers: string[]; rows: string[][] }
  | { type: 'hr' };

function isTableRow(line: string) {
  return line.trim().startsWith('|') && line.trim().endsWith('|');
}

function parseTableCells(line: string): string[] {
  return line
    .trim()
    .slice(1, -1)
    .split('|')
    .map((c) => c.trim());
}

function parseBlocks(source: string): Block[] {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // fenced code block
    if (/^```/.test(line)) {
      const codeLines: string[] = [];
      i += 1;
      while (i < lines.length && !/^```/.test(lines[i])) {
        codeLines.push(lines[i]);
        i += 1;
      }
      blocks.push({ type: 'code', text: codeLines.join('\n') });
      i += 1;
      continue;
    }

    // horizontal rule
    if (/^---+$/.test(line.trim()) || /^\*\*\*+$/.test(line.trim())) {
      blocks.push({ type: 'hr' });
      i += 1;
      continue;
    }

    // heading
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      blocks.push({
        type: 'heading',
        level: heading[1].length as 1 | 2 | 3,
        text: heading[2].trim(),
      });
      i += 1;
      continue;
    }

    // table: header row followed by separator row (---|---|---) followed by data rows
    if (isTableRow(line) && i + 1 < lines.length) {
      const separator = lines[i + 1];
      if (/^\|[-|\s:]+\|$/.test(separator.trim())) {
        const headers = parseTableCells(line);
        const rows: string[][] = [];
        i += 2;
        while (i < lines.length && isTableRow(lines[i])) {
          rows.push(parseTableCells(lines[i]));
          i += 1;
        }
        blocks.push({ type: 'table', headers, rows });
        continue;
      }
    }

    // bullet list
    const bullet = line.match(/^[-*+]\s+(.+)$/);
    if (bullet) {
      blocks.push({ type: 'bullet', text: bullet[1].trim() });
      i += 1;
      continue;
    }

    // ordered list
    const ordered = line.match(/^(\d+)\.\s+(.+)$/);
    if (ordered) {
      blocks.push({ type: 'ordered', index: Number(ordered[1]), text: ordered[2].trim() });
      i += 1;
      continue;
    }

    // blockquote
    const quote = line.match(/^>\s?(.+)$/);
    if (quote) {
      blocks.push({ type: 'blockquote', text: quote[1].trim() });
      i += 1;
      continue;
    }

    // non-empty paragraph
    if (line.trim()) {
      blocks.push({ type: 'paragraph', text: line.trim() });
    }
    i += 1;
  }

  return blocks;
}

function renderInline(
  text: string,
  textColor: string,
  accentColor: string,
  codeBackground: string,
  keyPrefix: string
): ReactNode[] {
  const nodes: ReactNode[] = [];
  // order matters: ** before * to avoid partial matches
  const pattern = /(\*\*[^*]+\*\*|\*[^*]+\*|_[^_]+_|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let part = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(
        <Text key={`${keyPrefix}-t-${part++}`} style={{ color: textColor }}>
          {text.slice(lastIndex, match.index)}
        </Text>
      );
    }

    const token = match[0];
    if (token.startsWith('**')) {
      nodes.push(
        <Text key={`${keyPrefix}-b-${part++}`} style={{ color: textColor, fontWeight: '700' }}>
          {token.slice(2, -2)}
        </Text>
      );
    } else if (token.startsWith('*') || token.startsWith('_')) {
      nodes.push(
        <Text key={`${keyPrefix}-i-${part++}`} style={{ color: textColor, fontStyle: 'italic' }}>
          {token.slice(1, -1)}
        </Text>
      );
    } else if (token.startsWith('`')) {
      nodes.push(
        <Text
          key={`${keyPrefix}-c-${part++}`}
          style={{ color: textColor, backgroundColor: codeBackground, fontFamily: 'monospace', fontSize: 13 }}
        >
          {token.slice(1, -1)}
        </Text>
      );
    } else {
      const linkMatch = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (linkMatch) {
        const [, label, url] = linkMatch;
        nodes.push(
          <Text
            key={`${keyPrefix}-l-${part++}`}
            style={{ color: accentColor, textDecorationLine: 'underline' }}
            onPress={() => Linking.openURL(url).catch(() => undefined)}
          >
            {label}
          </Text>
        );
      }
    }

    lastIndex = match.index + token.length;
  }

  if (lastIndex < text.length) {
    nodes.push(
      <Text key={`${keyPrefix}-t-${part++}`} style={{ color: textColor }}>
        {text.slice(lastIndex)}
      </Text>
    );
  }

  return nodes.length
    ? nodes
    : [<Text key={`${keyPrefix}-plain`} style={{ color: textColor }}>{text}</Text>];
}

export function ChatMarkdown({ text, textColor, mutedColor, accentColor, codeBackground }: ChatMarkdownProps) {
  const blocks = parseBlocks(text);

  return (
    <View style={styles.container}>
      {blocks.map((block, index) => {
        const key = `block-${index}`;

        if (block.type === 'hr') {
          return <View key={key} style={[styles.hr, { backgroundColor: mutedColor }]} />;
        }

        if (block.type === 'code') {
          return (
            <ScrollView key={key} horizontal showsHorizontalScrollIndicator={false}>
              <Text style={[styles.codeBlock, { color: textColor, backgroundColor: codeBackground }]}>
                {block.text}
              </Text>
            </ScrollView>
          );
        }

        if (block.type === 'heading') {
          const size = block.level === 1 ? 20 : block.level === 2 ? 17 : 15;
          return (
            <Text key={key} style={{ color: textColor, fontSize: size, fontWeight: '800', marginBottom: 6, marginTop: 4 }}>
              {renderInline(block.text, textColor, accentColor, codeBackground, key)}
            </Text>
          );
        }

        if (block.type === 'bullet') {
          return (
            <View key={key} style={styles.listRow}>
              <Text style={{ color: accentColor, marginRight: 8, lineHeight: 22 }}>{'\u2022'}</Text>
              <Text style={[styles.listText, { color: textColor }]}>
                {renderInline(block.text, textColor, accentColor, codeBackground, key)}
              </Text>
            </View>
          );
        }

        if (block.type === 'ordered') {
          return (
            <View key={key} style={styles.listRow}>
              <Text style={{ color: accentColor, marginRight: 6, minWidth: 20, lineHeight: 22 }}>
                {block.index}.
              </Text>
              <Text style={[styles.listText, { color: textColor }]}>
                {renderInline(block.text, textColor, accentColor, codeBackground, key)}
              </Text>
            </View>
          );
        }

        if (block.type === 'blockquote') {
          return (
            <View key={key} style={[styles.blockquote, { borderLeftColor: accentColor, backgroundColor: codeBackground }]}>
              <Text style={[styles.listText, { color: textColor }]}>
                {renderInline(block.text, textColor, accentColor, codeBackground, key)}
              </Text>
            </View>
          );
        }

        if (block.type === 'table') {
          return (
            <ScrollView key={key} horizontal showsHorizontalScrollIndicator={false} style={styles.tableScroll}>
              <View style={[styles.table, { borderColor: mutedColor }]}>
                {/* header */}
                <View style={[styles.tableRow, styles.tableHeaderRow, { backgroundColor: codeBackground }]}>
                  {block.headers.map((h, ci) => (
                    <Text
                      key={`${key}-h-${ci}`}
                      style={[styles.tableCell, styles.tableCellHeader, { color: textColor, borderColor: mutedColor }]}
                    >
                      {h}
                    </Text>
                  ))}
                </View>
                {/* data rows */}
                {block.rows.map((row, ri) => (
                  <View
                    key={`${key}-r-${ri}`}
                    style={[styles.tableRow, { backgroundColor: ri % 2 === 1 ? codeBackground : 'transparent' }]}
                  >
                    {row.map((cell, ci) => (
                      <Text
                        key={`${key}-r-${ri}-c-${ci}`}
                        style={[styles.tableCell, { color: textColor, borderColor: mutedColor }]}
                      >
                        {cell}
                      </Text>
                    ))}
                  </View>
                ))}
              </View>
            </ScrollView>
          );
        }

        // paragraph
        return (
          <Text key={key} style={[styles.paragraph, { color: textColor }]}>
            {renderInline(block.text, textColor, accentColor, codeBackground, key)}
          </Text>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 4 },
  paragraph: { fontSize: 14, lineHeight: 22, marginBottom: 2 },
  listRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 3 },
  listText: { flex: 1, fontSize: 14, lineHeight: 22 },
  codeBlock: { fontFamily: 'monospace', fontSize: 12, padding: 10, borderRadius: 8, marginBottom: 6 },
  blockquote: { borderLeftWidth: 3, paddingLeft: 10, paddingVertical: 4, marginBottom: 6, borderRadius: 4 },
  hr: { height: StyleSheet.hairlineWidth, marginVertical: 8 },
  tableScroll: { marginBottom: 8 },
  table: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 6, overflow: 'hidden' },
  tableRow: { flexDirection: 'row' },
  tableHeaderRow: {},
  tableCell: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    fontSize: 13,
    lineHeight: 19,
    minWidth: 80,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tableCellHeader: { fontWeight: '700' },
});
