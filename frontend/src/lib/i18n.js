import { computed, ref } from 'vue'
import { generatedUiMessages } from './generated-ui-messages.js'
import { apiErrorMessages } from './api-error-messages.js'

export const SUPPORTED_LOCALES = ['en', 'de']
export const DEFAULT_LOCALE = 'en'

const baseMessages = {
  en: {
    meetingHistoryAccess: {
      global_label: 'Default access to past meeting content',
      channel_label: 'Access to past meeting content',
      global_copy_help: 'This value is copied to newly created channels and group chats. Existing settings are not changed later.',
      active_participant_retention: 'People who actually joined a meeting retain access after leaving the channel or group.',
      denied: 'You do not have permission to view this meeting content under the channel meeting access settings.',
      restricted_title: 'Meeting content unavailable',
      options: {
        all_channel_members: {
          label: 'All channel members',
          description: 'All current members can view past meetings, including people added after the meeting.'
        },
        meeting_start_members: {
          label: 'Members at meeting start',
          description: 'Only current members who were already members when the meeting actually started can view it.'
        },
        active_participants: {
          label: 'Active participants only',
          description: 'Only people who actually joined the meeting can view it. An invitation or channel membership alone is not enough.'
        }
      }
    },
    languages: {
      en: 'English',
      de: 'German',
      es: 'Spanish',
      fr: 'French',
      it: 'Italian',
      nl: 'Dutch',
      pl: 'Polish',
      pt: 'Portuguese'
    },
    common: {
      back: 'Back',
      cancel: 'Cancel',
      save: 'Save',
      close: 'Close',
      login: 'Log in',
      profile: 'Profile',
      notes: 'Notes'
    },
    errors: {
      unexpected: 'Something went wrong'
    },
    setup: {
      title: 'Set up Nebulynk',
      steps: {
        platform: 'Platform',
        admin: 'Admin Account',
        done: 'Done'
      },
      fields: {
        platformName: 'Platform Name',
        domain: 'Domain (optional)',
        defaultLanguage: 'Default Language',
        displayName: 'Display Name',
        email: 'Email',
        password: 'Password'
      },
      placeholders: {
        platformName: 'e.g. My Company',
        domain: 'e.g. chat.mycompany.com',
        displayName: 'Admin',
        email: 'admin@example.com',
        password: 'Secure password'
      },
      buttons: {
        next: 'Next',
        setup: 'Set up',
        goToLogin: 'Go to Login'
      },
      success: {
        title: 'Platform set up!',
        description: 'You can now log in.'
      },
      validation: {
        platformNameRequired: 'Platform name is required',
        displayNameRequired: 'Display name is required',
        emailRequired: 'Email is required',
        passwordRequired: 'Password is required'
      },
      errors: {
        setupFailed: 'Setup failed'
      }
    },
    login: {
      title: 'Log in',
      twoFactor: {
        title: 'Verify your sign-in',
        description: 'Enter the current code from your authenticator app or use one of your backup codes.',
        hints: {
          totp: 'Use the 6-digit code from your authenticator app.',
          recovery: 'Use one of your one-time backup codes exactly as shown.'
        }
      },
      fields: {
        email: 'Email',
        password: 'Password',
        remember: 'Stay signed in',
        code: 'Authentication Code'
      },
      placeholders: {
        email: 'admin@example.com',
        password: 'Password',
        totpCode: '123456',
        recoveryCode: 'ABCD-EFGH-IJKL'
      },
      buttons: {
        submit: 'Log in',
        usePasskey: 'Log in with passkey',
        forgotPassword: 'Forgot password?',
        verify: 'Verify sign-in',
        back: 'Back',
        useRecoveryCode: 'Use backup code',
        useAuthenticatorCode: 'Use authenticator code'
      },
      validation: {
        emailRequired: 'Email is required',
        passwordRequired: 'Password is required'
      },
      errors: {
        loginFailed: 'Login failed'
      }
    },
    passwordPolicy: {
      requirement: 'Use at least {minLength} characters and {minTypes} of these character types: lowercase letters, uppercase letters, numbers, and special characters.',
      requirementsNotMet: 'Your password does not meet the configured password requirements.'
    },
    selfRegistration: {
      loginLink: 'Create an account',
      title: 'Create your account',
      description: 'Register for this Nebulynk workspace.',
      disabledTitle: 'Registration unavailable',
      disabledDescription: 'Self-registration is currently disabled for this workspace.',
      fields: {
        displayName: 'Display Name',
        email: 'Email',
        password: 'Password',
        passwordConfirm: 'Confirm Password'
      },
      placeholders: {
        displayName: 'Your name',
        email: 'you@example.com',
        password: 'Choose a secure password',
        passwordConfirm: 'Repeat password'
      },
      buttons: {
        register: 'Create account',
        goToLogin: 'Go to login'
      },
      success: {
        emailTitle: 'Check your email',
        emailDescription: 'We sent you a confirmation link. Open it to finish your registration.',
        manualTitle: 'Registration received',
        manualDescription: 'An administrator will review and activate your account before you can sign in.'
      },
      confirmation: {
        loading: 'Confirming your account...',
        activeTitle: 'Your account is active',
        activeDescription: 'Your email address was confirmed and you can now sign in.',
        pendingTitle: 'Email address confirmed',
        pendingDescription: 'Your account will now be reviewed by an administrator. You will receive an email when it is activated.',
        invalidDescription: 'This confirmation link is invalid or no longer available.'
      },
      errors: {
        displayNameRequired: 'Please enter a display name',
        emailRequired: 'Please enter an email address',
        passwordsMismatch: 'Passwords do not match',
        registrationFailed: 'Registration could not be completed',
        confirmationFailed: 'Account confirmation failed'
      }
    },
    selfRegistrationAdmin: {
      title: 'Registration',
      settingsTitle: 'Self-registration settings',
      enabled: 'Allow self-registration',
      enabledHelp: 'People can create their own member accounts when this is enabled.',
      domains: 'Allowed email domains',
      domainsHelp: 'Enter one exact domain per line. Leave empty to allow every email domain.',
      adminApproval: 'Require administrator approval',
      adminApprovalHelp: 'Confirmed accounts remain pending until an administrator activates them.',
      smtpWarning: 'SMTP is not configured. Registrants will not receive confirmation links and must be confirmed manually by an administrator.',
      openSmtp: 'Open SMTP settings',
      saved: 'Registration settings saved.',
      saveFailed: 'Registration settings could not be saved.',
      pendingTitle: 'Pending registrations',
      pendingMenuOne: '1 registration awaiting approval',
      pendingMenuMany: '{count} registrations awaiting approval',
      empty: 'No pending registrations.',
      email: 'Email',
      name: 'Name',
      status: 'Status',
      pendingSince: 'Pending since',
      pendingFor: 'Pending for',
      awaitingEmail: 'Awaiting email confirmation',
      awaitingApproval: 'Awaiting activation',
      confirm: 'Confirm',
      confirmAndActivate: 'Confirm and activate',
      activate: 'Activate',
      delete: 'Delete',
      deleteConfirm: 'Delete this pending registration permanently?',
      activated: 'Account activated.',
      activationEmailFailed: 'The account was activated, but the activation email could not be sent.',
      actionFailed: 'Registration action failed.'
    },
    securitySettings: {
      title: 'Security',
      passwordTitle: 'Password strength',
      passwordHelp: 'This applies to every password set from now on, including invitations, password changes, and resets.',
      basic: 'Basic - 8 characters and 2 character types',
      strong: 'Strong - 8 characters and 3 character types',
      veryStrong: 'Very strong - 10 characters and 3 character types',
      saved: 'Security settings saved.',
      saveFailed: 'Security settings could not be saved.'
    },
    passwordReset: {
      fields: {
        email: 'Email',
        password: 'New Password',
        passwordConfirm: 'Confirm New Password'
      },
      placeholders: {
        email: 'you@example.com',
        password: 'At least 8 characters',
        passwordConfirm: 'Repeat password'
      },
      buttons: {
        requestLink: 'Send reset link',
        savePassword: 'Save new password',
        goToLogin: 'Go to Login',
        backToLogin: 'Back to Login'
      },
      request: {
        title: 'Forgot your password?',
        description: 'Enter your email address and we will send you a password reset link if recovery is available for your account.',
        successTitle: 'Check your email',
        successDescription: 'If an eligible account exists and password recovery email is available, a reset link has been sent.'
      },
      reset: {
        title: 'Set a new password',
        description: 'Choose a new password for your account.',
        loading: 'Checking reset link...',
        invalidDescription: 'This reset link is invalid or no longer available.',
        successMessage: 'Your password has been updated. Please sign in again.'
      },
      errors: {
        emailRequired: 'Email is required',
        requestFailed: 'Password reset request failed',
        invalidToken: 'Reset link is invalid',
        passwordTooShort: 'Password must be at least 8 characters long',
        passwordsMismatch: 'Passwords do not match',
        resetFailed: 'Password could not be reset'
      }
    },
    passwordChange: {
      fields: {
        currentPassword: 'Current Password',
        newPassword: 'New Password',
        newPasswordConfirm: 'Confirm New Password'
      },
      placeholders: {
        currentPassword: 'Enter your current password',
        newPassword: 'At least 8 characters',
        newPasswordConfirm: 'Repeat new password'
      },
      buttons: {
        save: 'Update password'
      },
      success: 'Your password has been updated.',
      errors: {
        allFieldsRequired: 'Please fill in all password fields',
        passwordTooShort: 'Password must be at least 8 characters long',
        passwordsMismatch: 'Passwords do not match',
        changeFailed: 'Password could not be updated'
      }
    },
    twoFactor: {
      title: 'Two-factor authentication',
      description: 'Add an authenticator app as an extra sign-in step and keep one-time backup codes for recovery.',
      setup: {
        scanTitle: 'Scan on desktop',
        scanDescription: 'Scan this QR code with your authenticator app to add your Nebulynk account quickly.',
        openAppTitle: 'Open on this device',
        openAppDescription: 'Use the setup link below to jump straight into your authenticator app on mobile.',
        manualDescription: 'If scanning or app launch does not work, enter these setup details manually.'
      },
      status: {
        enabled: 'Enabled',
        disabled: 'Not enabled',
        pending: 'Setup in progress'
      },
      fields: {
        currentPassword: 'Current Password',
        code: 'Authentication Code',
        manualKey: 'Manual Setup Key',
        otpauthUrl: 'Setup URL'
      },
      placeholders: {
        currentPassword: 'Enter your current password',
        code: '123456'
      },
      buttons: {
        startSetup: 'Set up 2FA',
        restartSetup: 'Restart setup',
        confirmSetup: 'Enable 2FA',
        regenerateCodes: 'Regenerate backup codes',
        disable: 'Disable 2FA',
        cancelSetup: 'Cancel setup',
        openAuthenticator: 'Open authenticator app',
        showManualSetup: 'Use manual setup instead',
        copyManualKey: 'Copy key',
        copySetupUrl: 'Copy URL'
      },
      method: {
        totp: 'Authenticator app (TOTP)'
      },
      messages: {
        setupStarted: 'Two-factor setup is ready.',
        enabled: 'Two-factor authentication enabled.',
        disabled: 'Two-factor authentication disabled.',
        recoveryCodesRegenerated: 'New backup codes generated.',
        recoveryCodesShownOnce: 'Backup codes are shown only once. Store them somewhere safe now.',
        recoveryCodesHint: 'Each backup code works once and can replace your authenticator code if needed.',
        recoveryCodesRemaining: '{count} backup codes remaining.',
        guestUnavailable: 'Two-factor authentication is only available for member accounts.',
        authenticatorAppRequired: 'The authenticator app needs to be installed on this device to open the setup link.',
        manualKeyCopied: 'Manual setup key copied.',
        setupUrlCopied: 'Setup URL copied.'
      },
      errors: {
        actionFailed: 'Two-factor action failed',
        currentPasswordRequired: 'Please enter your current password',
        codeRequired: 'Please enter your current authentication code',
        openAuthenticatorFailed: 'Authenticator app could not be opened.',
        copyManualKeyFailed: 'Manual setup key could not be copied.',
        copySetupUrlFailed: 'Setup URL could not be copied.'
      },
      admin: {
        column: '2FA',
        enabled: 'Enabled',
        disabled: 'Disabled',
        resetAction: 'Reset 2FA',
        resetConfirm: 'Reset two-factor authentication for this user? This also signs them out on other sessions.',
        resetSuccess: 'Two-factor authentication was reset.',
        resetFailed: 'Two-factor authentication could not be reset.'
      }
    },
    passkeys: {
      title: 'Passkeys',
      description: 'Register one or more passkeys for passwordless sign-in on supported devices and browsers.',
      unsupported: 'This browser does not support passkeys.',
      empty: 'No passkeys registered yet.',
      fields: {
        currentPassword: 'Current Password',
        name: 'Passkey Name'
      },
      placeholders: {
        currentPassword: 'Enter your current password',
        name: 'e.g. Work laptop'
      },
      buttons: {
        add: 'Add passkey',
        create: 'Create passkey',
        cancel: 'Cancel',
        remove: 'Remove passkey',
        confirmRemove: 'Remove passkey'
      },
      messages: {
        created: 'Passkey created.',
        removed: 'Passkey removed.',
        available: '{count} passkeys registered.'
      },
      errors: {
        actionFailed: 'Passkey action failed',
        currentPasswordRequired: 'Please enter your current password'
      },
      labels: {
        backedUp: 'Synced',
        singleDevice: 'Single-device',
        multiDevice: 'Multi-device',
        lastUsed: 'Last used',
        created: 'Created'
      },
      fallbackName: 'Passkey from {date}',
      admin: {
        column: 'Passkeys',
        disabled: 'Disabled',
        enabledCount: '{count} active',
        resetAction: 'Reset passkeys',
        resetConfirm: 'Reset all passkeys for this user? This also signs them out on other sessions.',
        resetSuccess: 'Passkeys were reset.',
        resetFailed: 'Passkeys could not be reset.'
      }
    },
    userManagement: {
      status: 'Status',
      active: 'Active',
      deactivated: 'Deactivated',
      disableAction: 'Deactivate',
      enableAction: 'Activate',
      deleteAction: 'Delete',
      disableConfirm: 'Deactivate {name}? They will be signed out and must sign in again after reactivation.',
      enableConfirm: 'Reactivate {name}? They will need to sign in again.',
      deleteConfirm: 'Permanently delete {name}? Their account and dependent data cannot be recovered.',
      disableSuccess: 'User deactivated.',
      enableSuccess: 'User reactivated.',
      deleteSuccess: 'User permanently deleted.',
      actionFailed: 'User management action failed.'
    },
    primaryAdmin: {
      badge: 'Primary admin',
      transferAction: 'Transfer primary admin',
      transferTitle: 'Transfer primary admin',
      irreversibleWarning: 'This process is irreversible. After the transfer, only the new primary admin can transfer this role again.',
      targetLabel: 'New primary admin: {name} ({email})',
      confirmationLabel: 'Type TRANSFER_PRIMARY_ADMIN to confirm',
      reauthLabel: 'Security check',
      passwordMethod: 'Password',
      passkeyMethod: 'Passkey',
      currentPasswordLabel: 'Current password',
      currentPasswordPlaceholder: 'Enter your current password',
      currentPasswordRequired: 'Please enter your current password',
      confirmationRequired: 'Please type TRANSFER_PRIMARY_ADMIN to confirm this irreversible transfer.',
      cancel: 'Cancel',
      confirmTransfer: 'Transfer',
      transferSuccess: 'Primary admin was transferred.',
      transferFailed: 'Primary admin transfer failed'
    },
    sponsorship: {
      title: 'Support Nebulynk',
      description: 'Nebulynk is developed independently. Your sponsorship helps fund ongoing development, security, and long-term operations.',
      owner_note: 'This modal is shown only to the platform owner.',
      sponsor_action: 'Sponsor us',
      close_action: 'Close',
      settings_title: 'Support Nebulynk',
      settings_enabled_label: 'Weekly sponsorship notices',
      settings_enabled_help: 'Show the weekly sponsorship notice to the primary admin.',
      settings_preview_action: 'Show modal',
      settings_updated: 'Sponsorship notice preference updated.',
      settings_update_failed: 'Could not update the sponsorship notice preference.',
      menu_item: 'Sponsor us'
    },
    platformUpdates: {
      menu: 'Updates',
      title: 'Platform updates',
      installed: 'Installed version',
      latest: 'Latest version',
      lastSuccess: 'Last successful check',
      never: 'Never',
      refresh: 'Check now',
      checking: 'Checking for updates...',
      upToDate: 'Nebulynk is up to date.',
      updateAvailable: '{count} update(s) available.',
      securityAvailable: '{count} security-relevant release(s) affect this installation ({severity}).',
      ahead: 'This build is newer than the latest published stable release.',
      invalidBuild: 'The installed version is not a valid stable Semantic Version and cannot be compared.',
      unknownBuild: 'The installed version is not present in the verified stable catalog.',
      unknown: 'The installed build cannot be compared reliably.',
      checkFailed: 'The last update check failed. Cached information may be outdated.',
      cacheStale: 'The last verified release catalog is older than six hours.',
      checksDisabled: 'Automatic update and security checks are disabled.',
      cachedWarning: 'Last known release information remains visible but may be stale.',
      emailUnavailable: 'SMTP is not configured. Security update emails cannot be delivered.',
      emailDeliveryFailed: 'At least one security update email could not be delivered. Nebulynk will retry it during the next check.',
      acknowledge: 'Acknowledge notice',
      details: 'View update details',
      releaseNotes: 'Release notes',
      security: 'Security',
      upgradeNotes: 'Upgrade notes',
      backupRequired: 'A backup is required before updating.',
      downtimeExpected: 'Downtime is expected.',
      breaking: 'Contains breaking changes.',
      ownerSettings: 'Update check settings',
      checksEnabled: 'Automatic update checks',
      checksHelp: 'Nebulynk checks the signed official stable release catalog once per hour.',
      disableTitle: 'Disable security and update checks?',
      disableWarning: 'Nebulynk will no longer discover releases or security fixes and will stop sending security update emails. Cached information can become dangerously outdated.',
      confirmationLabel: 'Enter DISABLE_UPDATE_CHECKS to confirm',
      reauthMethod: 'Reauthentication method',
      password: 'Current password',
      passwordMethod: 'Password',
      passkeyMethod: 'Passkey',
      cancel: 'Cancel',
      disable: 'Disable checks',
      disabledSuccess: 'Update checks have been disabled.',
      enabledSuccess: 'Update checks have been enabled.',
      saveFailed: 'The update setting could not be changed.',
      checkFailedMessage: 'The update check could not be completed.',
      acknowledgeFailed: 'The update notice could not be acknowledged.',
      noReleases: 'No newer stable releases are available.',
      comparisonUnavailable: 'No trustworthy list of outstanding releases can be shown for this build state.',
      manualSteps: 'Manual steps',
      openGuide: 'Open upgrade guide',
      privacy: 'The check downloads the complete catalog without sending the installed version or an instance identifier.',
      bannerDisabled: 'Update checks are disabled. New security fixes will not be detected.',
      bannerSecurity: '{count} security-relevant Nebulynk update(s) are available (highest severity: {severity}).',
      bannerUpdate: 'A new Nebulynk version is available.'
    },
    systemInfo: {
      menu: 'System Info',
      title: 'System Info',
      storageUsage: 'Storage usage',
      refresh: 'Refresh',
      total: 'Total',
      database: 'Database',
      files: 'Files',
      meetingRecordings: 'Stored meeting recordings',
      objects: '{count} objects',
      lastUpdated: 'Measured: {time}',
      never: 'Not yet measured',
      stale: 'The displayed storage usage is more than ten minutes old. Refresh it to get current values.',
      partial: 'Some storage values are currently unavailable.',
      logicalUsage: 'Values show logical Nebulynk data usage. Docker volumes, PostgreSQL WAL, Garage metadata, replication, logs, and host disk capacity are not included.',
      refreshFailed: 'Storage usage could not be refreshed. The last successful values remain visible.',
      loadFailed: 'Storage usage could not be loaded.'
    },
    invite: {
      loading: 'Loading invitation...',
      invalidDescription: 'The invitation is invalid or no longer available.',
      expiredTitle: 'Invitation expired',
      expiredDescription: 'This invitation is no longer valid.',
      successTitle: 'Account created!',
      successDescription: 'You can now log in with your email and password.',
      invitationFrom: 'Invitation from {name}',
      fields: {
        email: 'Email',
        displayName: 'Display Name',
        password: 'Password',
        passwordConfirm: 'Confirm Password'
      },
      placeholders: {
        displayName: 'Your name',
        password: 'At least 8 characters',
        passwordConfirm: 'Repeat password'
      },
      buttons: {
        createAccount: 'Create account',
        goToLogin: 'Go to Login'
      },
      errors: {
        notFound: 'Invitation not found',
        displayNameRequired: 'Please enter a display name',
        passwordTooShort: 'Password must be at least 8 characters long',
        passwordsMismatch: 'Passwords do not match',
        createFailed: 'Failed to create account'
      }
    },
    meetingInvite: {
      loading: 'Loading meeting invite...',
      invalidDescription: 'This meeting link is invalid or no longer available.',
      untitled: 'Untitled meeting',
      fields: {
        displayName: 'Display Name',
        starts: 'Starts',
        joinNotBefore: 'Join available from',
        context: 'Context'
      },
      placeholders: {
        displayName: 'Your name'
      },
      buttons: {
        joinAsGuest: 'Join as guest',
        openMeeting: 'Open meeting'
      },
      status: {
        scheduled: 'Scheduled',
        active: 'Live now',
        ended: 'Ended'
      },
      errors: {
        loadFailed: 'Meeting link could not be loaded',
        displayNameRequired: 'Please enter a display name',
        acceptFailed: 'Meeting link could not be accepted'
      }
    },
    app: {
      notifications: 'Notifications',
      dropFileHint: 'Drop file here',
      emptyChannel: 'Choose a channel from the sidebar',
      uploadTooLarge: '{file} is too large (max. {max} MB)',
      uploadFailed: 'Upload failed: {file}'
    },
    ui: {
      components: {
        channel_is_archived: 'This channel is archived.',
        background_blur_unsupported_title: 'Background blur is unavailable',
        background_blur_unsupported_body: 'This device cannot apply background blur right now. You can still start your video without blur.',
        start_video_without_blur: 'Start video without blur',
        background_blur_not_supported: 'Background blur is not supported on this device or browser.',
        background_blur_enabled: 'Disable background blur',
        background_blur_disabled: 'Enable background blur',
        background_blur_update_failed: 'Background blur could not be updated.',
        camera_preference_update_failed: 'Preferred camera could not be updated.'
      },
      views: {
        meetings: 'Meetings',
        meetings_overview_hint: 'Scheduled, live, and past meetings in one place.',
        upcoming_meetings: 'Upcoming',
        live_meetings: 'Live',
        past_meetings: 'Past meetings',
        no_upcoming_meetings: 'No upcoming meetings.',
        no_live_meetings: 'No live meetings.',
        no_past_meetings: 'No past meetings yet.',
        time_unspecified: 'Time not specified',
        scheduled: 'Scheduled',
        cancelled: 'Cancelled',
        starts_at: 'Starts',
        ends_at: 'Ends',
        join_available_from: 'Join available from',
        schedule_meeting: 'Schedule meeting',
        schedule_meeting_hint: 'Create a meeting link ahead of time and invite people before it starts.',
        create_meeting_link: 'Create guest link',
        revoke_meeting_link: 'Revoke guest link',
        copy_meeting_link: 'Copy guest link',
        guest_link_ready: 'Guest link ready',
        guest_link_revoked: 'Guest link revoked',
        guest_link_copied: 'Guest link copied',
        guest_link_copy_failed: 'Guest link could not be copied',
        guest_link_help: 'Guests can join with this link during the allowed time window.',
        guest_link_expires_at: 'Link expires',
        open_meeting_ics: 'Calendar entry',
        reschedule_meeting: 'Reschedule',
        cancel_meeting: 'Cancel meeting',
        meeting_description: 'Description',
        meeting_video_controls: 'Video controls',
        meeting_video_visibility: 'Video visibility',
        background_blur: 'Background blur',
        background_blur_description: 'Softens your background behind the camera feed during meetings.',
        video_background_none: 'No background',
        video_background_image: 'Background image',
        video_backgrounds: 'Background images',
        video_background_upload: 'Upload image',
        video_background_generate: 'Generate image',
        video_background_prompt: 'Describe a background',
        video_background_prompt_placeholder: 'Modern office with warm light',
        video_background_global: 'Available to everyone',
        video_background_publish: 'Publish',
        video_background_unpublish: 'Unpublish',
        video_background_delete: 'Delete',
        video_background_preview: 'Camera preview',
        video_background_empty: 'No saved backgrounds yet.',
        video_background_save_failed: 'Video background could not be updated.',
        video_background_upload_failed: 'Background image could not be uploaded.',
        video_background_generate_failed: 'Background image could not be generated.',
        video_mirror: 'Mirror video',
        video_mirror_description: 'Mirror your local camera preview and self-view.',
        video_mirror_save_failed: 'Video mirror setting could not be updated.',
        preferred_camera: 'Preferred camera',
        preferred_camera_description: 'Choose which camera should be used for meeting video on this device when available.',
        settings_video: 'Video',
        settings_video_description: 'Manage your meeting camera and background blur preferences.',
        no_camera_devices: 'No camera devices are currently available.',
        camera_default_option: 'Automatic',
        camera_device_fallback: 'Camera {deviceId}',
        meeting_video_hidden: 'Meeting video hidden',
        meeting_video_hidden_compact: 'Videos hidden',
        meeting_video_hidden_detail: 'Video tiles are collapsed. Show them again whenever you want to watch participants.',
        meeting_video_hidden_detail_no_remote: 'Video tiles are collapsed. No remote participant video is currently available.',
        meeting_video_hidden_detail_incoming_off: 'Video tiles are collapsed and incoming participant video is currently disabled.',
        show_meeting_video: 'Show videos',
        hide_meeting_video: 'Hide videos',
        disable_incoming_video: 'Disable incoming video',
        enable_incoming_video: 'Enable incoming video',
        disable_participant_video: 'Disable this video',
        enable_participant_video: 'Enable this video',
        incoming_video_off: 'Incoming video off',
        visible_video_stream: 'Visible stream',
        select_visible_video_stream: 'Select a participant video',
        follow_active_speaker: 'Follow active speaker',
        incoming_video_participants: 'Incoming participant videos',
        showing_video_stream: 'Showing {name}',
        could_not_schedule_meeting: 'Meeting could not be scheduled',
        could_not_reschedule_meeting: 'Meeting could not be rescheduled',
        could_not_cancel_meeting: 'Meeting could not be cancelled',
        could_not_create_meeting_link: 'Guest link could not be created',
        could_not_revoke_meeting_link: 'Guest link could not be revoked',
        could_not_download_meeting_ics: 'Calendar entry could not be downloaded',
        scheduled_meeting_ready: 'Meeting scheduled',
        meeting_rescheduled: 'Meeting rescheduled',
        meeting_cancelled: 'Meeting cancelled'
      }
    },
    pwa: {
      install_title: 'Install app',
      install_heading: 'Add Nebulynk to your device',
      install_description: 'Install Nebulynk for faster access and a standalone app experience. On Android, it can also receive shared text, links, and files.',
      install_action: 'Install',
      install_success: 'Install prompt opened',
      install_dismissed: 'Install prompt dismissed',
      install_manual_action: 'Show steps',
      install_manual_description: 'This browser supports adding Nebulynk to the home screen, but the install step must be completed manually.',
      install_manual_instructions: 'Open the browser share menu and choose "Add to Home Screen" to install Nebulynk.'
    },
    share: {
      title: 'Share to Nebulynk',
      description: 'Choose where to continue with this shared content. Nothing is sent yet.',
      shared_text: 'Shared text and link',
      files: '{count, plural, one {# file} other {# files}}',
      target_label: 'Share to',
      target_placeholder: 'Search chats, channels, and meetings',
      open_chat: 'Open chat',
      open_workspace: 'Open workspace',
      discard: 'Discard',
      target_groups: {
        direct: 'Direct messages',
        groups: 'Group chats',
        channels: 'Channels',
        meetings: 'Meetings'
      },
      errors: {
        storage: 'Nebulynk could not save the shared content on this device.',
        unavailable: 'This shared content is no longer available.',
        account_mismatch: 'This shared content belongs to a different signed-in account.',
        no_content: 'No compatible text, link, or file was shared.',
        target_unavailable: 'This chat is no longer available. Choose a different target.',
        not_writable: 'You do not have permission to send messages there.',
        file_too_large: '{file_name} is too large (max. {max_size_mb} MB).',
        handoff_failed: 'Could not prepare the shared content. You can try again.'
      }
    },
    search: {
      actions: {
        open: 'Open search',
        load_more: 'Load more',
        reset_filters: 'Reset filters',
        submit: 'Search'
      },
      tabs: {
        messages: 'Messages',
        files: 'Files',
        meetings: 'Meetings'
      },
      filters: {
        from: 'Author',
        author_speaker: 'Author/Speaker',
        in: 'Channel',
        after: 'From date',
        before: 'To date',
        ext: 'File type'
      },
      placeholders: {
        messages: 'Search messages',
        meetings: 'Search meetings',
        files: 'Search files',
        from: 'Any person',
        in: 'Any channel',
        ext: 'e.g. pdf'
      },
      empty: {
        start: 'Start typing or add filters to search.',
        no_results: 'No results found.'
      },
      notices: {
        meetings_author_speaker_summary_hidden: 'Meeting summaries are hidden while the Author/Speaker filter is active.'
      },
      validation: {
        min_length: 'Enter at least {min} characters before searching.'
      },
      result_labels: {
        message: 'Message result',
        file: 'File result',
        meeting_summary: 'Meeting summary result',
        meeting_transcript: 'Meeting transcript result'
      },
      result_kinds: {
        chat: 'Chat',
        summary: 'Summary',
        transcript: 'Transcript'
      },
      option_labels: {
        call: 'Call {name}'
      }
    },
    sidebar: {
      sections: {
        channels: 'Channels',
        meetings: 'Meetings',
        voiceChannels: 'Voice Channels',
        archivedChannels: 'Archived Channels',
        directMessages: 'Direct Messages'
      },
      noMeetings: 'No live or scheduled meetings',
      noDirectMessages: 'No direct messages',
      buttons: {
        restore: 'Restore',
        admin: 'Admin',
        logout: 'Logout',
        createChannel: 'Create Channel'
      },
      actions: {
        openVoiceTextChat: 'Open text chat',
        activeMeeting: 'Active meeting'
      },
      createChannel: {
        title: 'Create Channel',
        fields: {
          name: 'Name',
          description: 'Description',
          type: 'Type',
          voice: 'Voice Channel',
          members: 'Initial Members'
        },
        placeholders: {
          name: 'channel-name',
          description: 'What is this about?',
          members: 'Select users'
        },
        types: {
          public: 'Public',
          private: 'Private'
        },
        buttons: {
          create: 'Create'
        }
      },
      channelBrowser: {
        title: 'Discover Channels',
        placeholders: {
          search: 'Search channels...'
        },
        buttons: {
          join: 'Join',
          open: 'Open'
        },
        empty: 'No public channels available'
      },
      messages: {
        restored: 'Channel restored',
        restoreFailed: 'Restore failed'
      }
    },
    profile: {
      title: 'Profile',
      editTitle: 'Edit Profile',
      cropTitle: 'Adjust Avatar',
      cameraTitle: 'Use Camera',
      cropHint: 'Move and zoom your image until the preview looks right.',
      previewLabel: 'Preview',
      zoomLabel: 'Zoom',
      labels: {
        email: 'Email',
        memberSince: 'Member since',
        displayName: 'Display Name',
        avatar: 'Avatar',
        camera: 'Camera',
        preferredLanguage: 'Language'
      },
      placeholders: {
        displayName: 'Your name'
      },
      buttons: {
        edit: 'Edit Profile',
        message: 'Send Message',
        uploadAvatar: 'Upload Avatar',
        changeAvatar: 'Change Avatar',
        removeAvatar: 'Remove Avatar',
        takeAvatarPhoto: 'Take Photo',
        captureAvatar: 'Capture',
        retakeAvatarPhoto: 'Retake',
        applyAvatar: 'Use Avatar'
      },
      status: {
        online: 'Online',
        away: 'Away',
        dnd: 'Do not disturb',
        offline: 'Offline'
      },
      errors: {
        openDmFailed: 'Could not open direct message',
        displayNameRequired: 'Display name is required',
        avatarTypeUnsupported: 'Please choose a JPG, PNG, or WebP image',
        avatarTooLarge: 'Avatar uploads are limited to 10 MB before processing',
        cameraNotFound: 'No camera found',
        cameraPermissionDenied: 'Camera permission denied',
        cameraUnavailable: 'Camera unavailable',
        saveFailed: 'Failed to save'
      },
      dateFallback: '-'
    }
  },
  de: {
    meetingHistoryAccess: {
      global_label: 'Standardzugriff auf vergangene Meeting-Inhalte',
      channel_label: 'Zugriff auf vergangene Meeting-Inhalte',
      global_copy_help: 'Dieser Wert wird in neu erstellte Channels und Gruppen-Chats kopiert. Bestehende Einstellungen werden später nicht verändert.',
      active_participant_retention: 'Personen, die einem Meeting tatsächlich beigetreten sind, behalten ihren Zugriff nach dem Verlassen des Channels oder der Gruppe.',
      denied: 'Du hast gemäß den Meeting-Zugriffseinstellungen dieses Channels keinen Zugriff auf die Inhalte dieses Meetings.',
      restricted_title: 'Meeting-Inhalte nicht verfügbar',
      options: {
        all_channel_members: {
          label: 'Alle Channel-Mitglieder',
          description: 'Alle aktuellen Mitglieder sehen vergangene Meetings, auch wenn sie erst nach dem Meeting hinzugefügt wurden.'
        },
        meeting_start_members: {
          label: 'Mitglieder beim Meeting-Start',
          description: 'Nur aktuelle Mitglieder, die beim tatsächlichen Start des Meetings bereits Mitglied waren, können darauf zugreifen.'
        },
        active_participants: {
          label: 'Nur aktive Teilnehmer',
          description: 'Nur Personen, die dem Meeting tatsächlich beigetreten sind, können darauf zugreifen. Eine Einladung oder Channel-Mitgliedschaft allein reicht nicht.'
        }
      }
    },
    languages: {
      en: 'Englisch',
      de: 'Deutsch',
      es: 'Spanisch',
      fr: 'Franzoesisch',
      it: 'Italienisch',
      nl: 'Niederlaendisch',
      pl: 'Polnisch',
      pt: 'Portugiesisch'
    },
    common: {
      back: 'Zurueck',
      cancel: 'Abbrechen',
      save: 'Speichern',
      close: 'Schliessen',
      login: 'Einloggen',
      profile: 'Profil',
      notes: 'Notizen'
    },
    errors: {
      unexpected: 'Ein unerwarteter Fehler ist aufgetreten'
    },
    setup: {
      title: 'Nebulynk einrichten',
      steps: {
        platform: 'Plattform',
        admin: 'Admin-Account',
        done: 'Fertig'
      },
      fields: {
        platformName: 'Plattform-Name',
        domain: 'Domain (optional)',
        defaultLanguage: 'Standardsprache',
        displayName: 'Anzeigename',
        email: 'E-Mail',
        password: 'Passwort'
      },
      placeholders: {
        platformName: 'z.B. Meine Firma',
        domain: 'z.B. chat.meinefirma.de',
        displayName: 'Admin',
        email: 'admin@example.com',
        password: 'Sicheres Passwort'
      },
      buttons: {
        next: 'Weiter',
        setup: 'Einrichten',
        goToLogin: 'Zum Login'
      },
      success: {
        title: 'Plattform eingerichtet!',
        description: 'Du kannst dich jetzt einloggen.'
      },
      validation: {
        platformNameRequired: 'Plattform-Name ist erforderlich',
        displayNameRequired: 'Anzeigename ist erforderlich',
        emailRequired: 'E-Mail ist erforderlich',
        passwordRequired: 'Passwort ist erforderlich'
      },
      errors: {
        setupFailed: 'Setup fehlgeschlagen'
      }
    },
    login: {
      title: 'Anmelden',
      twoFactor: {
        title: 'Anmeldung bestaetigen',
        description: 'Gib den aktuellen Code aus deiner Authenticator-App ein oder nutze einen deiner Backup-Codes.',
        hints: {
          totp: 'Verwende den 6-stelligen Code aus deiner Authenticator-App.',
          recovery: 'Verwende einen deiner einmaligen Backup-Codes genau wie angezeigt.'
        }
      },
      fields: {
        email: 'E-Mail',
        password: 'Passwort',
        remember: 'Angemeldet bleiben',
        code: 'Authentifizierungscode'
      },
      placeholders: {
        email: 'admin@example.com',
        password: 'Passwort',
        totpCode: '123456',
        recoveryCode: 'ABCD-EFGH-IJKL'
      },
      buttons: {
        submit: 'Einloggen',
        usePasskey: 'Mit Passkey anmelden',
        forgotPassword: 'Passwort vergessen?',
        verify: 'Anmeldung bestaetigen',
        back: 'Zurueck',
        useRecoveryCode: 'Backup-Code verwenden',
        useAuthenticatorCode: 'Authenticator-Code verwenden'
      },
      validation: {
        emailRequired: 'E-Mail ist erforderlich',
        passwordRequired: 'Passwort ist erforderlich'
      },
      errors: {
        loginFailed: 'Login fehlgeschlagen'
      }
    },
    passwordPolicy: {
      requirement: 'Verwende mindestens {minLength} Zeichen und {minTypes} dieser Zeichentypen: Kleinbuchstaben, Grossbuchstaben, Ziffern und Sonderzeichen.',
      requirementsNotMet: 'Dein Passwort erfuellt die konfigurierten Anforderungen nicht.'
    },
    selfRegistration: {
      loginLink: 'Konto erstellen',
      title: 'Konto erstellen',
      description: 'Registriere dich fuer diesen Nebulynk-Arbeitsbereich.',
      disabledTitle: 'Registrierung nicht verfuegbar',
      disabledDescription: 'Die Selbstregistrierung ist fuer diesen Arbeitsbereich derzeit deaktiviert.',
      fields: {
        displayName: 'Anzeigename',
        email: 'E-Mail',
        password: 'Passwort',
        passwordConfirm: 'Passwort bestaetigen'
      },
      placeholders: {
        displayName: 'Dein Name',
        email: 'du@beispiel.de',
        password: 'Sicheres Passwort waehlen',
        passwordConfirm: 'Passwort wiederholen'
      },
      buttons: {
        register: 'Konto erstellen',
        goToLogin: 'Zum Login'
      },
      success: {
        emailTitle: 'Pruefe deine E-Mails',
        emailDescription: 'Wir haben dir einen Bestaetigungslink gesendet. Oeffne ihn, um die Registrierung abzuschliessen.',
        manualTitle: 'Anmeldung eingegangen',
        manualDescription: 'Ein Administrator prueft und schaltet dein Konto frei. Du kannst dich anmelden, sobald es aktiviert wurde.'
      },
      confirmation: {
        loading: 'Dein Konto wird bestaetigt...',
        activeTitle: 'Dein Konto ist aktiv',
        activeDescription: 'Deine E-Mail-Adresse wurde bestaetigt. Du kannst dich jetzt anmelden.',
        pendingTitle: 'E-Mail-Adresse bestaetigt',
        pendingDescription: 'Dein Konto wird nun von einem Administrator ueberprueft. Du bekommst eine E-Mail, sobald es freigeschaltet ist.',
        invalidDescription: 'Dieser Bestaetigungslink ist ungueltig oder nicht mehr verfuegbar.'
      },
      errors: {
        displayNameRequired: 'Bitte gib einen Anzeigenamen ein',
        emailRequired: 'Bitte gib eine E-Mail-Adresse ein',
        passwordsMismatch: 'Passwoerter stimmen nicht ueberein',
        registrationFailed: 'Die Registrierung konnte nicht abgeschlossen werden',
        confirmationFailed: 'Die Kontobestaetigung ist fehlgeschlagen'
      }
    },
    selfRegistrationAdmin: {
      title: 'Registrierung',
      settingsTitle: 'Einstellungen fuer die Selbstregistrierung',
      enabled: 'Selbstregistrierung erlauben',
      enabledHelp: 'Wenn diese Option aktiv ist, koennen Personen eigene Mitgliedskonten erstellen.',
      domains: 'Erlaubte E-Mail-Domains',
      domainsHelp: 'Gib pro Zeile eine exakte Domain ein. Eine leere Liste erlaubt jede E-Mail-Domain.',
      adminApproval: 'Freigabe durch Administrator verlangen',
      adminApprovalHelp: 'Bestaetigte Konten bleiben ausstehend, bis ein Administrator sie aktiviert.',
      smtpWarning: 'SMTP ist nicht konfiguriert. Anmeldende erhalten keine Bestaetigungslinks und muessen manuell durch einen Administrator bestaetigt werden.',
      openSmtp: 'SMTP-Einstellungen oeffnen',
      saved: 'Registrierungseinstellungen gespeichert.',
      saveFailed: 'Registrierungseinstellungen konnten nicht gespeichert werden.',
      pendingTitle: 'Ausstehende Anmeldungen',
      pendingMenuOne: '1 Registrierung wartet auf Freigabe',
      pendingMenuMany: '{count} Registrierungen warten auf Freigabe',
      empty: 'Keine ausstehenden Anmeldungen.',
      email: 'E-Mail',
      name: 'Name',
      status: 'Status',
      pendingSince: 'Ausstehend seit',
      pendingFor: 'Ausstehend seit',
      awaitingEmail: 'Wartet auf E-Mail-Bestaetigung',
      awaitingApproval: 'Wartet auf Freischaltung',
      confirm: 'Bestaetigen',
      confirmAndActivate: 'Bestaetigen und aktivieren',
      activate: 'Aktivieren',
      delete: 'Loeschen',
      deleteConfirm: 'Diese ausstehende Anmeldung dauerhaft loeschen?',
      activated: 'Konto aktiviert.',
      activationEmailFailed: 'Das Konto wurde aktiviert, aber die Aktivierungs-E-Mail konnte nicht gesendet werden.',
      actionFailed: 'Registrierungsaktion fehlgeschlagen.'
    },
    securitySettings: {
      title: 'Sicherheit',
      passwordTitle: 'Passwortstaerke',
      passwordHelp: 'Diese Regel gilt ab jetzt fuer jedes gesetzte Passwort, einschliesslich Einladungen, Passwortaenderungen und Zuruecksetzungen.',
      basic: 'Basis - 8 Zeichen und 2 Zeichentypen',
      strong: 'Stark - 8 Zeichen und 3 Zeichentypen',
      veryStrong: 'Sehr stark - 10 Zeichen und 3 Zeichentypen',
      saved: 'Sicherheitseinstellungen gespeichert.',
      saveFailed: 'Sicherheitseinstellungen konnten nicht gespeichert werden.'
    },
    passwordReset: {
      fields: {
        email: 'E-Mail',
        password: 'Neues Passwort',
        passwordConfirm: 'Neues Passwort bestaetigen'
      },
      placeholders: {
        email: 'du@example.com',
        password: 'Mindestens 8 Zeichen',
        passwordConfirm: 'Passwort wiederholen'
      },
      buttons: {
        requestLink: 'Reset-Link senden',
        savePassword: 'Neues Passwort speichern',
        goToLogin: 'Zum Login',
        backToLogin: 'Zurueck zum Login'
      },
      request: {
        title: 'Passwort vergessen?',
        description: 'Gib deine E-Mail-Adresse ein. Wenn fuer dein Konto eine Wiederherstellung verfuegbar ist, senden wir dir einen Reset-Link.',
        successTitle: 'Postfach pruefen',
        successDescription: 'Falls ein passendes Konto existiert und der Passwort-Reset per E-Mail verfuegbar ist, wurde ein Reset-Link versendet.'
      },
      reset: {
        title: 'Neues Passwort setzen',
        description: 'Waehle ein neues Passwort fuer dein Konto.',
        loading: 'Reset-Link wird geprueft...',
        invalidDescription: 'Dieser Reset-Link ist ungueltig oder nicht mehr verfuegbar.',
        successMessage: 'Dein Passwort wurde aktualisiert. Bitte melde dich erneut an.'
      },
      errors: {
        emailRequired: 'E-Mail ist erforderlich',
        requestFailed: 'Passwort-Reset konnte nicht angefordert werden',
        invalidToken: 'Reset-Link ist ungueltig',
        passwordTooShort: 'Passwort muss mindestens 8 Zeichen lang sein',
        passwordsMismatch: 'Passwoerter stimmen nicht ueberein',
        resetFailed: 'Passwort konnte nicht zurueckgesetzt werden'
      }
    },
    passwordChange: {
      fields: {
        currentPassword: 'Aktuelles Passwort',
        newPassword: 'Neues Passwort',
        newPasswordConfirm: 'Neues Passwort bestaetigen'
      },
      placeholders: {
        currentPassword: 'Aktuelles Passwort eingeben',
        newPassword: 'Mindestens 8 Zeichen',
        newPasswordConfirm: 'Neues Passwort wiederholen'
      },
      buttons: {
        save: 'Passwort aktualisieren'
      },
      success: 'Dein Passwort wurde aktualisiert.',
      errors: {
        allFieldsRequired: 'Bitte fuelle alle Passwortfelder aus',
        passwordTooShort: 'Passwort muss mindestens 8 Zeichen lang sein',
        passwordsMismatch: 'Passwoerter stimmen nicht ueberein',
        changeFailed: 'Passwort konnte nicht aktualisiert werden'
      }
    },
    twoFactor: {
      title: 'Zwei-Faktor-Authentifizierung',
      description: 'Fuege eine Authenticator-App als zusaetzlichen Anmeldeschritt hinzu und bewahre einmalige Backup-Codes fuer den Notfall auf.',
      setup: {
        scanTitle: 'Auf dem Desktop scannen',
        scanDescription: 'Scanne diesen QR-Code mit deiner Authenticator-App, um dein Nebulynk-Konto schnell hinzuzufuegen.',
        openAppTitle: 'Auf diesem Geraet oeffnen',
        openAppDescription: 'Nutze auf dem Smartphone den Setup-Link, um direkt in deine Authenticator-App zu springen.',
        manualDescription: 'Wenn Scan oder App-Start nicht funktionieren, kannst du diese Daten manuell eintragen.'
      },
      status: {
        enabled: 'Aktiv',
        disabled: 'Nicht aktiv',
        pending: 'Einrichtung laeuft'
      },
      fields: {
        currentPassword: 'Aktuelles Passwort',
        code: 'Authentifizierungscode',
        manualKey: 'Manueller Einrichtungsschluessel',
        otpauthUrl: 'Setup-URL'
      },
      placeholders: {
        currentPassword: 'Aktuelles Passwort eingeben',
        code: '123456'
      },
      buttons: {
        startSetup: '2FA einrichten',
        restartSetup: 'Einrichtung neu starten',
        confirmSetup: '2FA aktivieren',
        regenerateCodes: 'Backup-Codes neu erzeugen',
        disable: '2FA deaktivieren',
        cancelSetup: 'Einrichtung abbrechen',
        openAuthenticator: 'Authenticator-App oeffnen',
        showManualSetup: 'Manuelle Einrichtung verwenden',
        copyManualKey: 'Schluessel kopieren',
        copySetupUrl: 'URL kopieren'
      },
      method: {
        totp: 'Authenticator-App (TOTP)'
      },
      messages: {
        setupStarted: 'Die Zwei-Faktor-Einrichtung ist bereit.',
        enabled: 'Die Zwei-Faktor-Authentifizierung ist jetzt aktiv.',
        disabled: 'Die Zwei-Faktor-Authentifizierung wurde deaktiviert.',
        recoveryCodesRegenerated: 'Neue Backup-Codes wurden erzeugt.',
        recoveryCodesShownOnce: 'Die Backup-Codes werden nur einmal angezeigt. Speichere sie jetzt an einem sicheren Ort.',
        recoveryCodesHint: 'Jeder Backup-Code funktioniert genau einmal und kann deinen Authenticator-Code ersetzen.',
        recoveryCodesRemaining: '{count} Backup-Codes uebrig.',
        guestUnavailable: 'Die Zwei-Faktor-Authentifizierung ist nur fuer Member-Konten verfuegbar.',
        authenticatorAppRequired: 'Damit der Setup-Link geoeffnet werden kann, muss auf diesem Geraet eine Authenticator-App installiert sein.',
        manualKeyCopied: 'Der manuelle Einrichtungsschluessel wurde kopiert.',
        setupUrlCopied: 'Die Setup-URL wurde kopiert.'
      },
      errors: {
        actionFailed: 'Die Zwei-Faktor-Aktion ist fehlgeschlagen',
        currentPasswordRequired: 'Bitte gib dein aktuelles Passwort ein',
        codeRequired: 'Bitte gib deinen aktuellen Authentifizierungscode ein',
        openAuthenticatorFailed: 'Die Authenticator-App konnte nicht geoeffnet werden.',
        copyManualKeyFailed: 'Der manuelle Einrichtungsschluessel konnte nicht kopiert werden.',
        copySetupUrlFailed: 'Die Setup-URL konnte nicht kopiert werden.'
      },
      admin: {
        column: '2FA',
        enabled: 'Aktiv',
        disabled: 'Inaktiv',
        resetAction: '2FA zuruecksetzen',
        resetConfirm: 'Soll die Zwei-Faktor-Authentifizierung fuer diesen Nutzer zurueckgesetzt werden? Dadurch werden auch andere Sitzungen abgemeldet.',
        resetSuccess: 'Die Zwei-Faktor-Authentifizierung wurde zurueckgesetzt.',
        resetFailed: 'Die Zwei-Faktor-Authentifizierung konnte nicht zurueckgesetzt werden.'
      }
    },
    passkeys: {
      title: 'Passkeys',
      description: 'Registriere einen oder mehrere Passkeys fuer passwortlose Anmeldungen auf unterstuetzten Geraeten und Browsern.',
      unsupported: 'Dieser Browser unterstuetzt keine Passkeys.',
      empty: 'Noch keine Passkeys registriert.',
      fields: {
        currentPassword: 'Aktuelles Passwort',
        name: 'Passkey-Name'
      },
      placeholders: {
        currentPassword: 'Gib dein aktuelles Passwort ein',
        name: 'z.B. Arbeitslaptop'
      },
      buttons: {
        add: 'Passkey hinzufuegen',
        create: 'Passkey erstellen',
        cancel: 'Abbrechen',
        remove: 'Passkey entfernen',
        confirmRemove: 'Passkey entfernen'
      },
      messages: {
        created: 'Passkey erstellt.',
        removed: 'Passkey entfernt.',
        available: '{count} Passkeys registriert.'
      },
      errors: {
        actionFailed: 'Passkey-Aktion fehlgeschlagen',
        currentPasswordRequired: 'Bitte gib dein aktuelles Passwort ein'
      },
      labels: {
        backedUp: 'Synchronisiert',
        singleDevice: 'Einzelgeraet',
        multiDevice: 'Mehrgeraet',
        lastUsed: 'Zuletzt verwendet',
        created: 'Erstellt'
      },
      fallbackName: 'Passkey von {date}',
      admin: {
        column: 'Passkeys',
        disabled: 'Inaktiv',
        enabledCount: '{count} aktiv',
        resetAction: 'Passkeys zuruecksetzen',
        resetConfirm: 'Sollen alle Passkeys fuer diesen Nutzer zurueckgesetzt werden? Dadurch werden auch andere Sitzungen abgemeldet.',
        resetSuccess: 'Die Passkeys wurden zurueckgesetzt.',
        resetFailed: 'Die Passkeys konnten nicht zurueckgesetzt werden.'
      }
    },
    userManagement: {
      status: 'Status',
      active: 'Aktiv',
      deactivated: 'Deaktiviert',
      disableAction: 'Deaktivieren',
      enableAction: 'Aktivieren',
      deleteAction: 'Loeschen',
      disableConfirm: '{name} deaktivieren? Die Person wird abgemeldet und muss sich nach der Reaktivierung erneut anmelden.',
      enableConfirm: '{name} wieder aktivieren? Die Person muss sich erneut anmelden.',
      deleteConfirm: '{name} endgueltig loeschen? Konto und abhaengige Daten koennen nicht wiederhergestellt werden.',
      disableSuccess: 'Nutzer deaktiviert.',
      enableSuccess: 'Nutzer wieder aktiviert.',
      deleteSuccess: 'Nutzer endgueltig geloescht.',
      actionFailed: 'Nutzeraktion fehlgeschlagen.'
    },
    primaryAdmin: {
      badge: 'Haupt-Admin',
      transferAction: 'Haupt-Admin uebertragen',
      transferTitle: 'Haupt-Admin uebertragen',
      irreversibleWarning: 'Dieser Prozess ist nicht umkehrbar. Nach der Uebertragung kann nur noch der neue Haupt-Admin diese Rolle erneut uebertragen.',
      targetLabel: 'Neuer Haupt-Admin: {name} ({email})',
      confirmationLabel: 'TRANSFER_PRIMARY_ADMIN zur Bestaetigung eingeben',
      reauthLabel: 'Sicherheitsabfrage',
      passwordMethod: 'Passwort',
      passkeyMethod: 'Passkey',
      currentPasswordLabel: 'Aktuelles Passwort',
      currentPasswordPlaceholder: 'Aktuelles Passwort eingeben',
      currentPasswordRequired: 'Bitte gib dein aktuelles Passwort ein',
      confirmationRequired: 'Bitte gib TRANSFER_PRIMARY_ADMIN ein, um diese unumkehrbare Uebertragung zu bestaetigen.',
      cancel: 'Abbrechen',
      confirmTransfer: 'Uebertragen',
      transferSuccess: 'Der Haupt-Admin wurde uebertragen.',
      transferFailed: 'Der Haupt-Admin konnte nicht uebertragen werden'
    },
    sponsorship: {
      title: 'Nebulynk unterstuetzen',
      description: 'Nebulynk wird unabhaengig entwickelt. Mit einer Foerderung hilfst du bei Weiterentwicklung, Sicherheit und langfristigem Betrieb.',
      owner_note: 'Dieses Modal wird nur dem Plattform-Owner angezeigt.',
      sponsor_action: 'Sponsoren',
      close_action: 'Schliessen',
      settings_title: 'Nebulynk unterstuetzen',
      settings_enabled_label: 'Woechentliche Spendenhinweise',
      settings_enabled_help: 'Zeigt dem Haupt-Admin woechentlich einen Spendenhinweis.',
      settings_preview_action: 'Modal anzeigen',
      settings_updated: 'Einstellung fuer Spendenhinweise aktualisiert.',
      settings_update_failed: 'Einstellung fuer Spendenhinweise konnte nicht aktualisiert werden.',
      menu_item: 'Sponsor us'
    },
    platformUpdates: {
      menu: 'Updates',
      title: 'Plattform-Updates',
      installed: 'Installierte Version',
      latest: 'Neueste Version',
      lastSuccess: 'Letzte erfolgreiche Pruefung',
      never: 'Nie',
      refresh: 'Jetzt pruefen',
      checking: 'Updates werden geprueft...',
      upToDate: 'Nebulynk ist aktuell.',
      updateAvailable: '{count} Update(s) verfuegbar.',
      securityAvailable: '{count} sicherheitsrelevante Release(s) betreffen diese Installation ({severity}).',
      ahead: 'Dieser Build ist neuer als das zuletzt veroeffentlichte Stable-Release.',
      invalidBuild: 'Die installierte Version ist keine gueltige stabile Semantic Version und kann nicht verglichen werden.',
      unknownBuild: 'Die installierte Version ist im verifizierten Stable-Katalog nicht enthalten.',
      unknown: 'Der installierte Build kann nicht verlaesslich verglichen werden.',
      checkFailed: 'Die letzte Update-Pruefung ist fehlgeschlagen. Gespeicherte Informationen koennen veraltet sein.',
      cacheStale: 'Der letzte verifizierte Release-Katalog ist aelter als sechs Stunden.',
      checksDisabled: 'Automatische Update- und Security-Pruefungen sind deaktiviert.',
      cachedWarning: 'Die letzten bekannten Release-Informationen bleiben sichtbar, koennen aber veraltet sein.',
      emailUnavailable: 'SMTP ist nicht konfiguriert. Security-Update-Mails koennen nicht zugestellt werden.',
      emailDeliveryFailed: 'Mindestens eine Security-Update-Mail konnte nicht zugestellt werden. Nebulynk versucht es bei der naechsten Pruefung erneut.',
      acknowledge: 'Hinweis quittieren',
      details: 'Update-Details anzeigen',
      releaseNotes: 'Release-Informationen',
      security: 'Sicherheit',
      upgradeNotes: 'Upgrade-Hinweise',
      backupRequired: 'Vor dem Update ist ein Backup erforderlich.',
      downtimeExpected: 'Es ist mit einer Unterbrechung zu rechnen.',
      breaking: 'Enthaelt inkompatible Aenderungen.',
      ownerSettings: 'Einstellungen der Update-Pruefung',
      checksEnabled: 'Automatische Update-Pruefung',
      checksHelp: 'Nebulynk prueft stuendlich den signierten offiziellen Stable-Release-Katalog.',
      disableTitle: 'Security- und Update-Pruefung deaktivieren?',
      disableWarning: 'Nebulynk erkennt danach keine neuen Releases oder Security-Fixes mehr und versendet keine Security-Update-Mails. Gespeicherte Informationen koennen gefaehrlich veralten.',
      confirmationLabel: 'Zur Bestaetigung DISABLE_UPDATE_CHECKS eingeben',
      reauthMethod: 'Methode zur erneuten Authentifizierung',
      password: 'Aktuelles Passwort',
      passwordMethod: 'Passwort',
      passkeyMethod: 'Passkey',
      cancel: 'Abbrechen',
      disable: 'Pruefung deaktivieren',
      disabledSuccess: 'Die Update-Pruefung wurde deaktiviert.',
      enabledSuccess: 'Die Update-Pruefung wurde aktiviert.',
      saveFailed: 'Die Update-Einstellung konnte nicht geaendert werden.',
      checkFailedMessage: 'Die Update-Pruefung konnte nicht abgeschlossen werden.',
      acknowledgeFailed: 'Der Update-Hinweis konnte nicht quittiert werden.',
      noReleases: 'Es sind keine neueren Stable-Releases verfuegbar.',
      comparisonUnavailable: 'Fuer diesen Build-Zustand kann keine verlaessliche Liste ausstehender Releases angezeigt werden.',
      manualSteps: 'Manuelle Schritte',
      openGuide: 'Upgrade-Anleitung oeffnen',
      privacy: 'Die Pruefung laedt den vollstaendigen Katalog, ohne installierte Version oder Instanzkennung zu senden.',
      bannerDisabled: 'Update-Pruefungen sind deaktiviert. Neue Security-Fixes werden nicht erkannt.',
      bannerSecurity: '{count} sicherheitsrelevante Nebulynk-Update(s) sind verfuegbar (hoechste Severity: {severity}).',
      bannerUpdate: 'Eine neue Nebulynk-Version ist verfuegbar.'
    },
    systemInfo: {
      menu: 'System Info',
      title: 'System Info',
      storageUsage: 'Speichernutzung',
      refresh: 'Aktualisieren',
      total: 'Gesamt',
      database: 'Datenbank',
      files: 'Dateien',
      meetingRecordings: 'Gespeicherte Meeting-Aufnahmen',
      objects: '{count} Objekte',
      lastUpdated: 'Messzeitpunkt: {time}',
      never: 'Noch nicht gemessen',
      stale: 'Die angezeigte Speichernutzung ist aelter als zehn Minuten. Aktualisiere sie fuer aktuelle Werte.',
      partial: 'Einige Speicherwerte sind derzeit nicht verfuegbar.',
      logicalUsage: 'Die Werte zeigen die logische Nebulynk-Datennutzung. Docker-Volumes, PostgreSQL-WAL, Garage-Metadaten, Replikation, Logs und die Host-Festplattenkapazitaet sind nicht enthalten.',
      refreshFailed: 'Die Speichernutzung konnte nicht aktualisiert werden. Die letzten erfolgreichen Werte bleiben sichtbar.',
      loadFailed: 'Die Speichernutzung konnte nicht geladen werden.'
    },
    invite: {
      loading: 'Einladung wird geladen...',
      invalidDescription: 'Die Einladung ist ungueltig oder nicht mehr verfuegbar.',
      expiredTitle: 'Einladung abgelaufen',
      expiredDescription: 'Diese Einladung ist leider nicht mehr gueltig.',
      successTitle: 'Konto erstellt!',
      successDescription: 'Du kannst dich jetzt mit deiner E-Mail und deinem Passwort anmelden.',
      invitationFrom: 'Einladung von {name}',
      fields: {
        email: 'E-Mail',
        displayName: 'Anzeigename',
        password: 'Passwort',
        passwordConfirm: 'Passwort bestaetigen'
      },
      placeholders: {
        displayName: 'Dein Name',
        password: 'Mindestens 8 Zeichen',
        passwordConfirm: 'Passwort wiederholen'
      },
      buttons: {
        createAccount: 'Konto erstellen',
        goToLogin: 'Zum Login'
      },
      errors: {
        notFound: 'Einladung nicht gefunden',
        displayNameRequired: 'Bitte gib einen Anzeigenamen ein',
        passwordTooShort: 'Passwort muss mindestens 8 Zeichen lang sein',
        passwordsMismatch: 'Passwoerter stimmen nicht ueberein',
        createFailed: 'Fehler beim Erstellen des Kontos'
      }
    },
    meetingInvite: {
      loading: 'Meeting-Link wird geladen...',
      invalidDescription: 'Dieser Meeting-Link ist ungueltig oder nicht mehr verfuegbar.',
      untitled: 'Unbenanntes Meeting',
      fields: {
        displayName: 'Anzeigename',
        starts: 'Start',
        joinNotBefore: 'Beitritt moeglich ab',
        context: 'Kontext'
      },
      placeholders: {
        displayName: 'Dein Name'
      },
      buttons: {
        joinAsGuest: 'Als Gast beitreten',
        openMeeting: 'Meeting oeffnen'
      },
      status: {
        scheduled: 'Geplant',
        active: 'Live',
        ended: 'Beendet'
      },
      errors: {
        loadFailed: 'Meeting-Link konnte nicht geladen werden',
        displayNameRequired: 'Bitte einen Anzeigenamen eingeben',
        acceptFailed: 'Meeting-Link konnte nicht angenommen werden'
      }
    },
    app: {
      notifications: 'Benachrichtigungen',
      dropFileHint: 'Datei hier ablegen',
      emptyChannel: 'Waehle einen Channel aus der Seitenleiste',
      uploadTooLarge: '{file} ist zu gross (max. {max} MB)',
      uploadFailed: 'Upload fehlgeschlagen: {file}'
    },
    ui: {
      components: {
        channel_is_archived: 'Dieser Channel ist archiviert.',
        background_blur_unsupported_title: 'Background Blur ist nicht verfuegbar',
        background_blur_unsupported_body: 'Dieses Geraet kann den Hintergrund derzeit nicht weichzeichnen. Du kannst dein Video trotzdem ohne Blur starten.',
        start_video_without_blur: 'Video ohne Blur starten',
        background_blur_not_supported: 'Background Blur wird auf diesem Geraet oder in diesem Browser nicht unterstuetzt.',
        background_blur_enabled: 'Background Blur deaktivieren',
        background_blur_disabled: 'Background Blur aktivieren',
        background_blur_update_failed: 'Background Blur konnte nicht aktualisiert werden.',
        camera_preference_update_failed: 'Bevorzugte Kamera konnte nicht aktualisiert werden.'
      },
      views: {
        meetings: 'Meetings',
        meetings_overview_hint: 'Geplante, laufende und vergangene Meetings an einem Ort.',
        upcoming_meetings: 'Bevorstehend',
        live_meetings: 'Live',
        past_meetings: 'Vergangene Meetings',
        no_upcoming_meetings: 'Keine bevorstehenden Meetings.',
        no_live_meetings: 'Keine laufenden Meetings.',
        no_past_meetings: 'Noch keine vergangenen Meetings.',
        time_unspecified: 'Zeit nicht angegeben',
        scheduled: 'Geplant',
        cancelled: 'Abgesagt',
        starts_at: 'Start',
        ends_at: 'Ende',
        join_available_from: 'Beitritt moeglich ab',
        schedule_meeting: 'Meeting planen',
        schedule_meeting_hint: 'Erstelle vorab einen Meeting-Link und lade Teilnehmer schon vor dem Start ein.',
        create_meeting_link: 'Gast-Link erstellen',
        revoke_meeting_link: 'Gast-Link widerrufen',
        copy_meeting_link: 'Gast-Link kopieren',
        guest_link_ready: 'Gast-Link bereit',
        guest_link_revoked: 'Gast-Link widerrufen',
        guest_link_copied: 'Gast-Link kopiert',
        guest_link_copy_failed: 'Gast-Link konnte nicht kopiert werden',
        guest_link_help: 'Gaeste koennen mit diesem Link im freigegebenen Zeitfenster beitreten.',
        guest_link_expires_at: 'Link gueltig bis',
        open_meeting_ics: 'Kalendereintrag',
        reschedule_meeting: 'Verschieben',
        cancel_meeting: 'Meeting absagen',
        meeting_description: 'Beschreibung',
        meeting_video_controls: 'Video-Steuerung',
        meeting_video_visibility: 'Video-Sichtbarkeit',
        background_blur: 'Hintergrund weichzeichnen',
        background_blur_description: 'Weichzeichnet deinen Hintergrund hinter dem Kamerabild waehrend Meetings.',
        video_background_none: 'Kein Hintergrund',
        video_background_image: 'Hintergrundbild',
        video_backgrounds: 'Hintergrundbilder',
        video_background_upload: 'Bild hochladen',
        video_background_generate: 'Bild generieren',
        video_background_prompt: 'Hintergrund beschreiben',
        video_background_prompt_placeholder: 'Modernes Buero mit warmem Licht',
        video_background_global: 'Fuer alle verfuegbar',
        video_background_publish: 'Freigeben',
        video_background_unpublish: 'Freigabe entfernen',
        video_background_delete: 'Loeschen',
        video_background_preview: 'Kamera-Vorschau',
        video_background_empty: 'Noch keine gespeicherten Hintergruende.',
        video_background_save_failed: 'Video-Hintergrund konnte nicht aktualisiert werden.',
        video_background_upload_failed: 'Hintergrundbild konnte nicht hochgeladen werden.',
        video_background_generate_failed: 'Hintergrundbild konnte nicht generiert werden.',
        video_mirror: 'Video spiegeln',
        video_mirror_description: 'Spiegelt deine lokale Kamera-Vorschau und eigene Video-Kachel.',
        video_mirror_save_failed: 'Video-Spiegelung konnte nicht aktualisiert werden.',
        preferred_camera: 'Bevorzugte Kamera',
        preferred_camera_description: 'Waehle aus, welche Kamera fuer Meeting-Video auf diesem Geraet verwendet werden soll, wenn sie verfuegbar ist.',
        settings_video: 'Video',
        settings_video_description: 'Verwalte deine Meeting-Kamera und den Background Blur.',
        no_camera_devices: 'Derzeit sind keine Kameras verfuegbar.',
        camera_default_option: 'Automatisch',
        camera_device_fallback: 'Kamera {deviceId}',
        meeting_video_hidden: 'Meeting-Video ausgeblendet',
        meeting_video_hidden_compact: 'Videos ausgeblendet',
        meeting_video_hidden_detail: 'Die Video-Kacheln sind eingeklappt. Du kannst sie jederzeit wieder einblenden.',
        meeting_video_hidden_detail_no_remote: 'Die Video-Kacheln sind eingeklappt. Aktuell ist kein Remote-Video verfuegbar.',
        meeting_video_hidden_detail_incoming_off: 'Die Video-Kacheln sind eingeklappt und eingehende Teilnehmer-Videos sind derzeit deaktiviert.',
        show_meeting_video: 'Videos einblenden',
        hide_meeting_video: 'Videos ausblenden',
        disable_incoming_video: 'Eingehende Videos deaktivieren',
        enable_incoming_video: 'Eingehende Videos aktivieren',
        disable_participant_video: 'Dieses Video deaktivieren',
        enable_participant_video: 'Dieses Video aktivieren',
        incoming_video_off: 'Eingehendes Video aus',
        visible_video_stream: 'Sichtbarer Stream',
        select_visible_video_stream: 'Teilnehmer-Video auswaehlen',
        follow_active_speaker: 'Aktivem Sprecher folgen',
        incoming_video_participants: 'Eingehende Teilnehmer-Videos',
        showing_video_stream: '{name} wird angezeigt',
        could_not_schedule_meeting: 'Meeting konnte nicht geplant werden',
        could_not_reschedule_meeting: 'Meeting konnte nicht verschoben werden',
        could_not_cancel_meeting: 'Meeting konnte nicht abgesagt werden',
        could_not_create_meeting_link: 'Gast-Link konnte nicht erstellt werden',
        could_not_revoke_meeting_link: 'Gast-Link konnte nicht widerrufen werden',
        could_not_download_meeting_ics: 'Kalendereintrag konnte nicht geladen werden',
        scheduled_meeting_ready: 'Meeting geplant',
        meeting_rescheduled: 'Meeting verschoben',
        meeting_cancelled: 'Meeting abgesagt'
      }
    },
    pwa: {
      install_title: 'App installieren',
      install_heading: 'Nebulynk auf dein Geraet legen',
      install_description: 'Installiere Nebulynk fuer schnelleren Zugriff und ein app-aehnliches Erlebnis. Auf Android kann die installierte App ausserdem geteilten Text, Links und Dateien empfangen.',
      install_action: 'Installieren',
      install_success: 'Installationsdialog geoeffnet',
      install_dismissed: 'Installationsdialog geschlossen',
      install_manual_action: 'Schritte anzeigen',
      install_manual_description: 'Dieser Browser kann Nebulynk zum Home-Bildschirm hinzufuegen, aber der Installationsschritt muss manuell erfolgen.',
      install_manual_instructions: 'Oeffne das Teilen-Menue im Browser und waehle "Zum Home-Bildschirm", um Nebulynk zu installieren.'
    },
    share: {
      title: 'Mit Nebulynk teilen',
      description: 'Waehle aus, in welchem Chat du mit diesem geteilten Inhalt fortfahren moechtest. Es wird noch nichts gesendet.',
      shared_text: 'Geteilter Text und Link',
      files: '{count, plural, one {# Datei} other {# Dateien}}',
      target_label: 'Teilen mit',
      target_placeholder: 'Chats, Channels und Meetings durchsuchen',
      open_chat: 'Chat oeffnen',
      open_workspace: 'Workspace oeffnen',
      discard: 'Verwerfen',
      target_groups: {
        direct: 'Direktnachrichten',
        groups: 'Gruppenchats',
        channels: 'Channels',
        meetings: 'Meetings'
      },
      errors: {
        storage: 'Nebulynk konnte den geteilten Inhalt nicht auf diesem Geraet speichern.',
        unavailable: 'Dieser geteilte Inhalt ist nicht mehr verfuegbar.',
        account_mismatch: 'Dieser geteilte Inhalt gehoert zu einem anderen angemeldeten Konto.',
        no_content: 'Es wurde kein kompatibler Text, Link oder Datei geteilt.',
        target_unavailable: 'Dieser Chat ist nicht mehr verfuegbar. Waehle ein anderes Ziel.',
        not_writable: 'Du hast keine Berechtigung, dort Nachrichten zu senden.',
        file_too_large: '{file_name} ist zu gross (max. {max_size_mb} MB).',
        handoff_failed: 'Der geteilte Inhalt konnte nicht vorbereitet werden. Du kannst es erneut versuchen.'
      }
    },
    search: {
      actions: {
        open: 'Suche oeffnen',
        load_more: 'Mehr laden',
        reset_filters: 'Filter zuruecksetzen',
        submit: 'Suchen'
      },
      tabs: {
        messages: 'Nachrichten',
        files: 'Dateien',
        meetings: 'Meetings'
      },
      filters: {
        from: 'Person',
        author_speaker: 'Autor/Speaker',
        in: 'Channel',
        after: 'Von Datum',
        before: 'Bis Datum',
        ext: 'Dateityp'
      },
      placeholders: {
        messages: 'Nachrichten suchen',
        meetings: 'Meetings durchsuchen',
        files: 'Dateien suchen',
        from: 'Beliebige Person',
        in: 'Beliebiger Channel',
        ext: 'z.B. pdf'
      },
      empty: {
        start: 'Tippe eine Suche oder setze Filter.',
        no_results: 'Keine Treffer gefunden.'
      },
      notices: {
        meetings_author_speaker_summary_hidden: 'Meeting-Zusammenfassungen sind ausgeblendet, solange der Autor/Speaker-Filter aktiv ist.'
      },
      validation: {
        min_length: 'Gib mindestens {min} Zeichen ein, bevor du suchst.'
      },
      result_labels: {
        message: 'Nachrichten-Treffer',
        file: 'Datei-Treffer',
        meeting_summary: 'Meeting-Zusammenfassungs-Treffer',
        meeting_transcript: 'Meeting-Transkript-Treffer'
      },
      result_kinds: {
        chat: 'Chat',
        summary: 'Zusammenfassung',
        transcript: 'Transkript'
      },
      option_labels: {
        call: 'Call {name}'
      }
    },
    sidebar: {
      sections: {
        channels: 'Channels',
        meetings: 'Meetings',
        voiceChannels: 'Voice-Channels',
        archivedChannels: 'Archivierte Channels',
        directMessages: 'Direktnachrichten'
      },
      noMeetings: 'Keine laufenden oder geplanten Meetings',
      noDirectMessages: 'Keine Direktnachrichten',
      buttons: {
        restore: 'Wiederherstellen',
        admin: 'Admin',
        logout: 'Logout',
        createChannel: 'Channel erstellen'
      },
      actions: {
        openVoiceTextChat: 'Text-Chat oeffnen',
        activeMeeting: 'Aktives Meeting'
      },
      createChannel: {
        title: 'Channel erstellen',
        fields: {
          name: 'Name',
          description: 'Beschreibung',
          type: 'Typ',
          voice: 'Voice-Channel',
          members: 'Direkt hinzufuegen'
        },
        placeholders: {
          name: 'channel-name',
          description: 'Worum geht es?',
          members: 'Nutzer auswaehlen'
        },
        types: {
          public: 'Oeffentlich',
          private: 'Privat'
        },
        buttons: {
          create: 'Erstellen'
        }
      },
      channelBrowser: {
        title: 'Channels entdecken',
        placeholders: {
          search: 'Channels suchen...'
        },
        buttons: {
          join: 'Beitreten',
          open: 'Oeffnen'
        },
        empty: 'Keine oeffentlichen Channels verfuegbar'
      },
      messages: {
        restored: 'Channel wiederhergestellt',
        restoreFailed: 'Wiederherstellen fehlgeschlagen'
      }
    },
    profile: {
      title: 'Profil',
      editTitle: 'Profil bearbeiten',
      cropTitle: 'Avatar anpassen',
      cameraTitle: 'Kamera verwenden',
      cropHint: 'Verschiebe und zoome dein Bild, bis die Vorschau passt.',
      previewLabel: 'Vorschau',
      zoomLabel: 'Zoom',
      labels: {
        email: 'E-Mail',
        memberSince: 'Mitglied seit',
        displayName: 'Anzeigename',
        avatar: 'Avatar',
        camera: 'Kamera',
        preferredLanguage: 'Sprache'
      },
      placeholders: {
        displayName: 'Dein Name'
      },
      buttons: {
        edit: 'Profil bearbeiten',
        message: 'Nachricht senden',
        uploadAvatar: 'Avatar hochladen',
        changeAvatar: 'Avatar aendern',
        removeAvatar: 'Avatar entfernen',
        takeAvatarPhoto: 'Foto aufnehmen',
        captureAvatar: 'Aufnehmen',
        retakeAvatarPhoto: 'Neu aufnehmen',
        applyAvatar: 'Avatar verwenden'
      },
      status: {
        online: 'Online',
        away: 'Abwesend',
        dnd: 'Nicht stoeren',
        offline: 'Offline'
      },
      errors: {
        openDmFailed: 'Direktnachricht konnte nicht geoeffnet werden',
        displayNameRequired: 'Anzeigename ist erforderlich',
        avatarTypeUnsupported: 'Bitte waehle ein JPG-, PNG- oder WebP-Bild',
        avatarTooLarge: 'Avatar-Uploads sind vor der Verarbeitung auf 10 MB begrenzt',
        cameraNotFound: 'Keine Kamera gefunden',
        cameraPermissionDenied: 'Kamera-Berechtigung verweigert',
        cameraUnavailable: 'Kamera nicht verfuegbar',
        saveFailed: 'Fehler beim Speichern'
      },
      dateFallback: '-'
    }
  }
}

function deepMerge(target, source) {
  for (const [key, value] of Object.entries(source || {})) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const base = target[key] && typeof target[key] === 'object' && !Array.isArray(target[key]) ? target[key] : {}
      target[key] = deepMerge(base, value)
      continue
    }
    target[key] = value
  }
  return target
}

function mergeMessages(base, extra) {
  return deepMerge(JSON.parse(JSON.stringify(base)), extra)
}

const messages = mergeMessages(
  mergeMessages(baseMessages, generatedUiMessages),
  apiErrorMessages
)

const currentLocale = ref(DEFAULT_LOCALE)
const platformDefaultLocale = ref(DEFAULT_LOCALE)

function normalizeLocale(locale, fallback = DEFAULT_LOCALE) {
  if (typeof locale !== 'string') return fallback
  const candidate = locale.trim().toLowerCase()
  if (!candidate) return fallback
  return SUPPORTED_LOCALES.includes(candidate) ? candidate : fallback
}

function resolveMessage(locale, key) {
  const path = String(key).split('.')
  let cursor = messages[locale]
  for (const segment of path) {
    if (cursor && Object.prototype.hasOwnProperty.call(cursor, segment)) {
      cursor = cursor[segment]
    } else {
      return null
    }
  }
  return typeof cursor === 'string' ? cursor : null
}

function parseIcuOptions(raw) {
  const options = {}
  const optionRegex = /(=\d+|zero|one|two|few|many|other)\s*\{([^{}]*)\}/g
  let match
  while ((match = optionRegex.exec(raw)) !== null) {
    options[match[1]] = match[2]
  }
  return options
}

function formatPluralBlocks(template, params, locale) {
  const pluralRegex = /\{(\w+),\s*plural,\s*((?:[^{}]|\{[^{}]*\})+)\}/g
  return template.replace(pluralRegex, (_, variable, rawOptions) => {
    const value = Number(params?.[variable] ?? 0)
    const options = parseIcuOptions(rawOptions)
    const exactKey = `=${value}`
    const pluralRule = new Intl.PluralRules(locale).select(value)
    const selected = options[exactKey] || options[pluralRule] || options.other || ''
    return selected.replace(/#/g, String(value))
  })
}

function formatSelectBlocks(template, params) {
  const selectRegex = /\{(\w+),\s*select,\s*((?:[^{}]|\{[^{}]*\})+)\}/g
  return template.replace(selectRegex, (_, variable, rawOptions) => {
    const value = String(params?.[variable] ?? 'other')
    const options = parseIcuOptions(rawOptions)
    return options[value] || options.other || ''
  })
}

function interpolate(template, params = {}, locale = currentLocale.value) {
  const withPlurals = formatPluralBlocks(template, params, locale)
  const withSelects = formatSelectBlocks(withPlurals, params)
  return withSelects.replace(/\{(\w+)\}/g, (_, token) => String(params[token] ?? `{${token}}`))
}

export function t(key, params) {
  const localeMessage = resolveMessage(currentLocale.value, key)
  if (localeMessage) return interpolate(localeMessage, params, currentLocale.value)
  const fallbackMessage = resolveMessage(DEFAULT_LOCALE, key)
  if (fallbackMessage) return interpolate(fallbackMessage, params, DEFAULT_LOCALE)
  return key
}

function updateDocumentLang(locale) {
  if (typeof document === 'undefined') return
  document.documentElement.setAttribute('lang', locale)
}

export function setLocale(locale, { persist = true } = {}) {
  const normalized = normalizeLocale(locale)
  currentLocale.value = normalized
  updateDocumentLang(normalized)
  if (persist && typeof localStorage !== 'undefined') {
    localStorage.setItem('locale', normalized)
  }
}

export function setPlatformDefaultLocale(locale) {
  platformDefaultLocale.value = normalizeLocale(locale)
}

export function getPlatformDefaultLocale() {
  return platformDefaultLocale.value
}

export function getCurrentLocale() {
  return currentLocale.value
}

export function applyLocaleForUser(user) {
  const preferredLocale = normalizeLocale(user?.preferred_locale, platformDefaultLocale.value)
  setLocale(preferredLocale)
}

export function getLocaleOptions() {
  return SUPPORTED_LOCALES.map((locale) => ({
    label: t(`languages.${locale}`),
    value: locale
  }))
}

export function setupI18n(app) {
  app.config.globalProperties.$t = t
  app.config.globalProperties.$setLocale = setLocale
  app.provide('i18n', {
    locale: computed(() => currentLocale.value),
    t,
    setLocale
  })
}

export function getNaiveUiLocale(locale) {
  return normalizeLocale(locale, DEFAULT_LOCALE)
}
