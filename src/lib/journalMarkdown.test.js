import { describe, expect, test } from 'vitest'
import { applyMarkdownEdit } from './journalMarkdown.js'

describe('applyMarkdownEdit', () => {
  test('wraps selected text and keeps the content selected', () => {
    expect(applyMarkdownEdit('the old road', 4, 7, { before: '**', after: '**' })).toEqual({
      text: 'the **old** road',
      selectionStart: 6,
      selectionEnd: 9,
    })
  })

  test('inserts editable placeholder text when nothing is selected', () => {
    expect(applyMarkdownEdit('', 0, 0, { before: '[', after: '](url)', placeholder: 'link text' })).toEqual({
      text: '[link text](url)',
      selectionStart: 1,
      selectionEnd: 10,
    })
  })

  test('prefixes every selected line', () => {
    expect(applyMarkdownEdit('before\none\ntwo\nafter', 7, 14, { linePrefix: '- ' })).toEqual({
      text: 'before\n- one\n- two\nafter',
      selectionStart: 9,
      selectionEnd: 18,
    })
  })
})
