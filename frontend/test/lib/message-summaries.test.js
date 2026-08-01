import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MESSAGE_SUMMARY_MIN_CHARS,
  compareSummariesByTimeline,
  formatSummaryTimeLabel,
  getSummaryDisplayRange,
  getSummaryTimelineAnchor,
  isMessageSelectableForSummary,
  isMessageSummarizable,
  mergeMessagesAndSummaries
} from '../../src/lib/message-summaries.js'

describe('message summary helpers', () => {
  it('uses a configurable default threshold for single-message summaries', () => {
    expect(DEFAULT_MESSAGE_SUMMARY_MIN_CHARS).toBe(400)
    expect(isMessageSummarizable({ content: 'x'.repeat(399), type: 'text' })).toBe(false)
    expect(isMessageSummarizable({ content: 'x'.repeat(400), type: 'text' })).toBe(true)
    expect(isMessageSummarizable({ content: 'x'.repeat(600), type: 'system' })).toBe(false)
  })

  it('keeps selection looser than single-message summarization', () => {
    expect(isMessageSelectableForSummary({ content: 'short', type: 'text' })).toBe(true)
    expect(isMessageSelectableForSummary({ content: '', type: 'text' })).toBe(false)
    expect(isMessageSelectableForSummary({ content: 'system', type: 'system' })).toBe(false)
  })

  it('merges private summary artifacts into the message timeline chronologically', () => {
    const timeline = mergeMessagesAndSummaries([
      { id: 'message-1', created_at: '2026-04-17T09:00:00.000Z' },
      { id: 'message-2', created_at: '2026-04-17T09:10:00.000Z' }
    ], [
      { id: 'summary-1', created_at: '2026-04-17T09:05:00.000Z' }
    ])

    expect(timeline.map((item) => item.id)).toEqual([
      'message:message-1',
      'summary:summary-1',
      'message:message-2'
    ])
    expect(timeline[2].messageIndex).toBe(1)
  })

  it('anchors summary timeline placement to the covered message range instead of AI creation time', () => {
    const timeline = mergeMessagesAndSummaries([
      { id: 'message-1', created_at: '2026-04-17T09:00:00.000Z' },
      { id: 'message-2', created_at: '2026-04-17T09:10:00.000Z' },
      { id: 'message-3', created_at: '2026-04-17T09:20:00.000Z' }
    ], [
      {
        id: 'summary-1',
        created_at: '2026-04-17T09:30:00.000Z',
        source_started_at: '2026-04-17T09:05:00.000Z',
        source_ended_at: '2026-04-17T09:10:00.000Z'
      }
    ])

    expect(timeline.map((item) => item.id)).toEqual([
      'message:message-1',
      'message:message-2',
      'summary:summary-1',
      'message:message-3'
    ])
  })

  it('falls back through source and lifecycle timestamps for summary ordering helpers', () => {
    expect(getSummaryTimelineAnchor({
      source_started_at: '2026-04-17T09:00:00.000Z',
      source_ended_at: '2026-04-17T09:10:00.000Z',
      created_at: '2026-04-17T09:30:00.000Z',
      updated_at: '2026-04-17T09:35:00.000Z'
    })).toBe('2026-04-17T09:10:00.000Z')

    expect(getSummaryTimelineAnchor({
      source_started_at: '2026-04-17T09:00:00.000Z',
      created_at: '2026-04-17T09:30:00.000Z'
    })).toBe('2026-04-17T09:00:00.000Z')

    expect(getSummaryTimelineAnchor({
      created_at: '2026-04-17T09:30:00.000Z',
      updated_at: '2026-04-17T09:35:00.000Z'
    })).toBe('2026-04-17T09:30:00.000Z')

    expect(getSummaryTimelineAnchor({
      updated_at: '2026-04-17T09:35:00.000Z'
    })).toBe('2026-04-17T09:35:00.000Z')
  })

  it('places summaries after messages when they share the same anchor timestamp', () => {
    const timeline = mergeMessagesAndSummaries([
      { id: 'message-1', created_at: '2026-04-17T09:10:00.000Z' }
    ], [
      {
        id: 'summary-1',
        source_ended_at: '2026-04-17T09:10:00.000Z',
        created_at: '2026-04-17T09:30:00.000Z'
      }
    ])

    expect(timeline.map((item) => item.id)).toEqual([
      'message:message-1',
      'summary:summary-1'
    ])
  })

  it('hides summaries that sit completely outside the currently loaded message window', () => {
    const timeline = mergeMessagesAndSummaries([
      { id: 'message-2', created_at: '2026-04-17T09:10:00.000Z' },
      { id: 'message-3', created_at: '2026-04-17T09:20:00.000Z' }
    ], [
      {
        id: 'summary-old',
        source_started_at: '2026-04-17T08:00:00.000Z',
        source_ended_at: '2026-04-17T08:05:00.000Z',
        created_at: '2026-04-17T09:30:00.000Z'
      }
    ])

    expect(timeline.map((item) => item.id)).toEqual([
      'message:message-2',
      'message:message-3'
    ])
  })

  it('shows summaries once their covered range overlaps the loaded message window', () => {
    const timeline = mergeMessagesAndSummaries([
      { id: 'message-1', created_at: '2026-04-17T08:00:00.000Z' },
      { id: 'message-2', created_at: '2026-04-17T08:05:00.000Z' },
      { id: 'message-3', created_at: '2026-04-17T09:20:00.000Z' }
    ], [
      {
        id: 'summary-old',
        source_started_at: '2026-04-17T08:00:00.000Z',
        source_ended_at: '2026-04-17T08:05:00.000Z',
        created_at: '2026-04-17T09:30:00.000Z'
      }
    ])

    expect(timeline.map((item) => item.id)).toEqual([
      'message:message-1',
      'message:message-2',
      'summary:summary-old',
      'message:message-3'
    ])
  })

  it('exposes summary display bounds and deterministic summary sorting fallbacks', () => {
    expect(getSummaryDisplayRange({
      source_started_at: '2026-04-17T09:00:00.000Z',
      source_ended_at: '2026-04-17T09:10:00.000Z'
    })).toEqual({
      startAt: '2026-04-17T09:00:00.000Z',
      endAt: '2026-04-17T09:10:00.000Z'
    })

    expect(getSummaryDisplayRange({
      source_ended_at: '2026-04-17T09:10:00.000Z'
    })).toEqual({
      startAt: '2026-04-17T09:10:00.000Z',
      endAt: '2026-04-17T09:10:00.000Z'
    })

    const sorted = [
      { id: 'summary-2', source_started_at: '2026-04-17T09:00:00.000Z' },
      { id: 'summary-1', updated_at: '2026-04-17T08:50:00.000Z' },
      { id: 'summary-3', source_ended_at: '2026-04-17T09:00:00.000Z' }
    ].sort(compareSummariesByTimeline)

    expect(sorted.map((summary) => summary.id)).toEqual(['summary-1', 'summary-2', 'summary-3'])
  })

  it('formats same-day summary ranges with one date and a time span', () => {
    expect(formatSummaryTimeLabel({
      source_started_at: '2026-04-17T09:05:00',
      source_ended_at: '2026-04-17T09:35:00'
    }, { locale: 'de-DE' })).toBe('17.04.2026, 09:05-09:35')
  })

  it('formats identical summary bounds as a single localized date-time', () => {
    expect(formatSummaryTimeLabel({
      source_started_at: '2026-04-17T09:05:00',
      source_ended_at: '2026-04-17T09:05:00'
    }, { locale: 'de-DE' })).toBe('17.04.2026, 09:05')
  })

  it('formats multi-day summary ranges with explicit start and end date-times', () => {
    expect(formatSummaryTimeLabel({
      source_started_at: '2026-04-17T23:10:00',
      source_ended_at: '2026-04-18T08:40:00'
    }, { locale: 'de-DE' })).toBe('17.04.2026, 23:10 - 18.04.2026, 08:40')
  })

  it('formats legacy single-timestamp fallbacks as one localized date-time', () => {
    expect(formatSummaryTimeLabel({
      created_at: '2026-04-17T10:15:00'
    }, { locale: 'de-DE' })).toBe('17.04.2026, 10:15')
  })

  it('stays safe when summary timestamps are missing or invalid', () => {
    expect(formatSummaryTimeLabel({
      source_started_at: 'not-a-date',
      source_ended_at: 'still-not-a-date'
    }, { locale: 'de-DE' })).toBe('')

    expect(formatSummaryTimeLabel({}, { locale: 'de-DE' })).toBe('')
  })
})
