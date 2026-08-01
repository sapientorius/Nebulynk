import { test, expect } from '@playwright/test';

test.describe('Screenshot generation', () => {
  // Helper to take a screenshot of the complete viewport. When an element is
  // provided it is only scrolled into view first so the relevant UI is visible,
  // but the screenshot itself always captures the full browser viewport (not a
  // cropped element region) — which is what we need for platform website assets.
  const screenshot = async (page, name, element = null, fullPage = false) => {
    const path = `test-results/screenshots/${name}.png`;
    if (element) {
      await element.scrollIntoViewIfNeeded();
      // Give hover/popover/scroll-driven UI a moment to settle before capture.
      await page.waitForTimeout(150);
    }
    await page.screenshot({ path, fullPage });
  };

  // All sidebar sections are expanded by default, so only click the toggle when
  // it is currently collapsed (aria-expanded !== 'true'). Clicking an already
  // expanded section would collapse it and hide its items.
  const ensureSectionExpanded = async (page, testId) => {
    const toggle = page.getByTestId(testId)
    const expanded = await toggle.getAttribute('aria-expanded')
    if (expanded !== 'true') {
      await toggle.click()
      await page.waitForTimeout(200)
    }
  };

  const openPastMeetingWithSummary = async (page) => {
    const pastMeetingsSection = page.locator('.meetings-group').filter({ hasText: 'Past meetings' }).first()
    await expect(pastMeetingsSection).toBeVisible({ timeout: 5000 })

    const summarizedPastMeeting = pastMeetingsSection
      .locator('.meeting-overview-card')
      .filter({ has: page.getByTestId('meeting-card-mini-summary') })
      .first()

    await summarizedPastMeeting.waitFor({ state: 'visible', timeout: 10_000 })
    const openButton = summarizedPastMeeting.getByTestId('meeting-card-open')
    await Promise.all([
      page.waitForURL(/\/meetings\//, { timeout: 30_000 }),
      openButton.click()
    ])
  }

  const waitForVisibleMeetingSummary = async (page) => {
    await page.getByTestId('meeting-view').waitFor({ state: 'visible', timeout: 15_000 })
    await page.getByTestId('meeting-summary-panel').waitFor({ state: 'visible', timeout: 15_000 })

    const summaryContent = page
      .getByTestId('meeting-summary-decision')
      .or(page.getByTestId('meeting-summary-open-item'))
      .or(page.getByTestId('meeting-summary-topic'))
      .first()
    await expect(summaryContent).toBeVisible({ timeout: 10_000 })
  }

  test.beforeEach(async ({ page }) => {
    // Start from login page for each test iteration
    await page.goto('/login');

    // If the platform is not initialized, the router redirects /login to /setup.
    // That means we are not running against the seeded demo database. Fail fast
    // with an actionable message instead of waiting out the full test timeout.
    const setupVisible = await page.getByTestId('setup-view')
      .waitFor({ state: 'visible', timeout: 3000 })
      .then(() => true)
      .catch(() => false)

    if (setupVisible) {
      throw new Error(
        'Screenshots spec requires the seeded demo database. ' +
        'Run `npm run screenshots` from the repo root (it seeds nebulynk_demo_en ' +
        'and starts the backend/frontend against it). Do not run this spec via ' +
        'the default e2e config, which uses an empty database.'
      )
    }

    await page.getByTestId('login-view').waitFor({ state: 'visible', timeout: 15000 })
  });

  test('generate screenshots for light and dark themes', async ({ page }) => {
    // 1. Login screen (before login) - theme does not affect login screen significantly
    await screenshot(page, 'login-screen');

    // Login with demo credentials (alex@nebulynk.dev is the seeded demo admin)
    await page.getByTestId('login-email').fill('alex@nebulynk.dev')
    await page.getByTestId('login-password').fill('demo1234')
    await Promise.all([
      page.waitForURL(/\/channels\//, { timeout: 30_000 }),
      page.getByTestId('login-submit').click()
    ])
    // After login we are on home (/ or /channels)

    // Define themes to iterate (n-select option labels are locale-aware; the
    // English demo seed uses preferred_locale 'en', so labels are 'Light'/'Dark')
    const themeLabels = { light: 'Light', dark: 'Dark' }
    const themes = ['light', 'dark'];
    for (const theme of themes) {
      // Navigate to settings to set theme
      await page.goto('/settings');
      await page.getByTestId('settings-view').waitFor({ state: 'visible', timeout: 15_000 })
      // settings-theme-select is a Naive UI n-select (not a native <select>),
      // so open the dropdown and click the matching option.
      const themeSelect = page.getByTestId('settings-theme-select')
      await themeSelect.locator('.n-base-selection').click()
      await page.locator('.n-base-select-option', { hasText: themeLabels[theme] }).click()
      // Save settings
      await page.getByTestId('settings-save-general').click()
      // Allow the saved theme preference to be applied by the theme store
      await page.waitForTimeout(1000)
      // Return to a channel to have a consistent UI
      await page.goto('/')
      await page.waitForURL(/\/channels\//, { timeout: 30_000 })

      // 2. Screen after login (main app view)
      await screenshot(page, `app-after-login_${theme}`);

      // 3. Expanded message menu (more actions) in a channel
      // Ensure we are in a channel with messages (default general)
      await page.getByTestId('message-list').waitFor({ state: 'visible', timeout: 15_000 })
      // Message action buttons are hover-revealed, so hover a message first.
      const firstMessage = page.locator('.message-item').first()
      await firstMessage.waitFor({ state: 'visible', timeout: 10_000 })
      await firstMessage.hover()
      const overflowBtn = firstMessage.locator('[data-testid="message-action-overflow"]')
      await overflowBtn.click()
      // Wait for the popover to appear
      const overflowMenu = page.getByTestId('message-action-overflow-menu')
      await expect(overflowMenu).toBeVisible({ timeout: 5000 });
      await screenshot(page, `expanded-message-menu_${theme}`, overflowMenu);

      // 4. Active meeting (from meetings overview live section)
      await page.goto('/meetings');
      await page.getByTestId('meetings-overview-view').waitFor({ state: 'visible', timeout: 15_000 })
      // Section titles are i18n: live_meetings -> "Live", past_meetings -> "Past meetings"
      const liveMeetingsSection = page.locator('.meetings-group').filter({ hasText: 'Live' }).first();
      await expect(liveMeetingsSection).toBeVisible({ timeout: 5000 });
      await screenshot(page, `active-meeting_${theme}`, liveMeetingsSection);

      // 5. Ended meeting with summary
      await openPastMeetingWithSummary(page)
      await waitForVisibleMeetingSummary(page)
      await screenshot(page, `ended-meeting-with-summary_${theme}`);

      // 6. Chat with expanded member list
      // Go back to a channel (e.g., general) to open member sidebar
      await page.goto('/channels')
      await page.getByTestId('app-view').waitFor({ state: 'visible', timeout: 15_000 })
      // Click the members button in the channel header
      const membersBtn = page.getByTestId('channel-header-members')
      await membersBtn.click()
      // Wait for the member panel to appear (sidebar on desktop)
      const memberPanel = page.locator('.member-panel')
      await expect(memberPanel).toBeVisible({ timeout: 5000 })
      await screenshot(page, `chat-with-member-list_${theme}`, memberPanel)

      // 7. Direct chat with messages
      // All sidebar sections are expanded by default; only expand if collapsed.
      await ensureSectionExpanded(page, 'sidebar-section-toggle-directMessages')
      const dmItems = page.locator('.dm-item')
      await expect(dmItems.first()).toBeVisible({ timeout: 5000 })
      const urlBeforeDm = page.url()
      await dmItems.first().click()
      await page.waitForURL((url) => url.toString() !== urlBeforeDm, { timeout: 30_000 })
      await page.getByTestId('message-list').waitFor({ state: 'visible', timeout: 15_000 })
      const messageList = page.locator('.message-list-content')
      await screenshot(page, `direct-chat-with-messages_${theme}`, messageList)

      // 8. Meeting overview
      await page.goto('/meetings')
      await page.getByTestId('meetings-overview-view').waitFor({ state: 'visible', timeout: 15_000 })
      await screenshot(page, `meeting-overview_${theme}`)

      // 9. User menu popover
      const userMenuTrigger = page.getByTestId('open-user-menu')
      await userMenuTrigger.click()
      const userMenuPanel = page.getByTestId('user-menu-panel')
      await expect(userMenuPanel).toBeVisible({ timeout: 5000 })
      await screenshot(page, `user-menu-popover_${theme}`, userMenuPanel)

      // 10. Active voice channel
      // Sidebar sections are expanded by default; only expand if collapsed.
      await ensureSectionExpanded(page, 'sidebar-section-toggle-voiceChannels')
      const voiceChannelList = page.locator('.voice-channel-list')
      await expect(voiceChannelList).toBeVisible({ timeout: 5000 })
      await screenshot(page, `active-voice-channel_${theme}`, voiceChannelList)
    }
  });
});
