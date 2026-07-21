export function applyMarkdownEdit(text, selectionStart, selectionEnd, tool) {
  if (tool.linePrefix) {
    const lineStart = text.lastIndexOf('\n', Math.max(0, selectionStart - 1)) + 1
    const nextBreak = text.indexOf('\n', selectionEnd)
    const lineEnd = nextBreak === -1 ? text.length : nextBreak
    const block = text.slice(lineStart, lineEnd) || tool.placeholder
    const formatted = block.split('\n').map(line => `${tool.linePrefix}${line}`).join('\n')
    return {
      text: `${text.slice(0, lineStart)}${formatted}${text.slice(lineEnd)}`,
      selectionStart: lineStart + tool.linePrefix.length,
      selectionEnd: lineStart + formatted.length,
    }
  }

  const content = text.slice(selectionStart, selectionEnd) || tool.placeholder
  const formatted = `${tool.before}${content}${tool.after}`
  return {
    text: `${text.slice(0, selectionStart)}${formatted}${text.slice(selectionEnd)}`,
    selectionStart: selectionStart + tool.before.length,
    selectionEnd: selectionStart + tool.before.length + content.length,
  }
}
