import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('MeetingsOverviewView', () => {
  it('loads dedicated overview buckets and renders meeting action cards in a responsive grid', () => {
    const source = readFileSync(resolve('src/views/MeetingsOverviewView.vue'), 'utf8')

    expect(source).toContain("name: 'MeetingsOverviewView'")
    expect(source).toContain("import MeetingActionCard from '../components/MeetingActionCard.vue'")
    expect(source).toContain("pastVisibleCount: 8")
    expect(source).toContain("pastPageSize: 8")
    expect(source).toContain('await this.meetingsStore.loadOverviewBuckets({ pastVisibleCount })')
    expect(source).toContain("upcoming: buckets.upcoming || []")
    expect(source).toContain("live: buckets.live || []")
    expect(source).toContain("past: buckets.past || []")
    expect(source).toContain("this.canLoadMorePast = !!buckets.pastHasMore")
    expect(source).toContain('grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));')
    expect(source).toContain('grid-template-columns: 1fr;')
    expect(source).toContain('overflow-y: auto;')
  })

  it('keeps cards clickable while join routes through the meeting store and past meetings can load more without losing mini-summary cards', () => {
    const source = readFileSync(resolve('src/views/MeetingsOverviewView.vue'), 'utf8')

    expect(source).toContain("await this.$router.push(`/meetings/${meetingId}`)")
    expect(source).toContain("await this.meetingsStore.join(meetingId)")
    expect(source).toContain("window.$message?.error(getApiErrorMessage(error) || this.$t('ui.components.could_not_join_call'))")
    expect(source).toContain('variant="overview"')
    expect(source).toContain("@keydown.space.prevent=\"openMeeting(meeting.id)\"")
    expect(source).toContain('...buildMeetingCardState({')
    expect(source).toContain('data-testid="meetings-overview-past-load-more"')
    expect(source).toContain("{{ $t('search.actions.load_more') }}")
    expect(source).toContain('async loadMorePastMeetings()')
    expect(source).toContain('pastVisibleCount: this.pastVisibleCount + this.pastPageSize')
    expect(source).toContain("meeting.ended_at || meeting.scheduled_end_at || meeting.started_at")
    expect(source).toContain("return this.$t('ui.views.time_unspecified')")
    expect(source).toContain(':tabindex="isMeetingRestricted(meeting) ? -1 : 0"')
    expect(source).toContain('if (this.isMeetingRestricted(meeting)) return')
    expect(source).toContain("'meetingsStore.historyAccessRevision'")
  })
})
