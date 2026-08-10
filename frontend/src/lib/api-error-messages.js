export const apiErrorMessages = {
  en: {
    api: {
      authentication: {
        account_disabled: 'This account is disabled',
        account_pending: 'This account is not active yet',
        authentication_required: 'Authentication required',
        invalid_credentials: 'Email or password is incorrect',
        invalid_token: 'Invalid token',
        rate_limited: 'Too many attempts. Please wait {retry_after_seconds} seconds and try again.'
      },
      auth_login: {
        unexpected_error: 'Login failed unexpectedly'
      },
      auth_session: {
        authentication_required: 'Authentication required',
        invalid_csrf_token: 'Your session security check failed. Please sign in again.',
        invalid_refresh_token: 'Your session expired. Please sign in again.',
        refresh_session_expired: 'Your session expired. Please sign in again.',
        unexpected_error: 'Session handling failed'
      },
      ai: {
        base_url_dns_lookup_failed: 'The AI provider host could not be resolved in production',
        base_url_https_required: 'AI provider Base URL must use HTTPS in production',
        base_url_invalid: 'AI provider Base URL must be an absolute HTTP(S) URL without credentials, query string, or fragment',
        base_url_not_supported_for_provider: 'A custom Base URL is only supported for OpenAI-compatible providers',
        base_url_private_host_forbidden: 'AI provider Base URL must not target localhost or a private network in production',
        base_url_required: 'Base URL is required for this provider',
        capability_not_supported: 'This provider does not support the selected AI function',
        function_config_incomplete: 'This AI function needs an active provider and model',
        function_config_not_found: 'AI function configuration not found',
        image_generation_provider_unsupported: 'This provider does not support image generation',
        model_cache_invalid: 'Saved model cache is invalid',
        model_fetch_failed: 'Models could not be loaded',
        models_query_invalid: 'provider_instance_id and capability are required',
        provider_capability_mismatch: 'This provider type does not support the AI function',
        provider_instance_disabled: 'Active AI functions cannot use a disabled provider',
        provider_instance_in_use: 'Provider instance is still assigned to an AI function',
        provider_instance_not_found: 'AI provider instance not found',
        provider_secret_not_found: 'AI provider secret not found',
        provider_type_immutable: 'Provider type cannot be changed',
        provider_type_invalid: 'Unknown AI provider type'
      },
      anthropic: {
        com: 'Anthropic API'
      },
      channel_members: {
        channel_id_required: 'channel_id is required',
        membership_not_found: 'Membership not found'
      },
      channel_read_state: {
        unsupported_target: 'Unsupported read-state target'
      },
      channels: {
        channel_not_found: 'Channel not found',
        dm_member_removal_not_supported: 'Members cannot be removed from direct chats',
        membership_not_found: 'Not a member of this channel',
        membership_required: 'You are not a member of this channel',
        not_found: 'Channel not found',
        one_or_more_user_ids_invalid: 'One or more user IDs are invalid',
        self_join_public_only: 'Self-join is only allowed for active public channels',
        self_leave_not_supported: 'Leaving this channel type is not supported'
      },
      dms: {
        conversation_access_denied: 'No access to this conversation',
        dm_not_found: 'DM not found',
        guest_accounts_forbidden: 'Guest accounts cannot use direct messages',
        meeting_history_access_forbidden: 'Only the group owner or a platform administrator can change meeting history access',
        one_or_more_user_ids_invalid: 'One or more user IDs are invalid',
        only_group_dms_editable: 'Only group DMs can be edited',
        user_ids_must_not_contain_self: 'user_ids must not contain your own id'
      },
      files: {
        access_other_users_files_denied: 'No access to files of other users',
        channel_access_denied: 'No access to this channel',
        delete_owner_only: 'Only the owner can delete this file',
        file_access_denied: 'No access to this file',
        file_not_found: 'File not found'
      },
      invite_accept: {
        completion_failed: 'Invitation could not be completed',
        invite_expired: 'Invitation has expired',
        invite_not_found: 'Invitation not found',
        invite_not_found_or_used: 'Invitation not found or already used',
        rate_limited: 'Too many invite attempts. Please wait {retry_after_seconds} seconds and try again.',
        token_required: 'Token is required',
        user_with_email_exists: 'A user with this email already exists'
      },
      invites: {
        only_revoke_status_change_allowed: 'Invitations can only be revoked',
        pending_invite_for_email_already_exists: 'A pending invitation for this email already exists',
        user_with_email_already_exists: 'A user with this email already exists'
      },
      livekit_webhook: {
        unauthorized: 'Unauthorized'
      },
      klipy: {
        com: 'KLIPY API'
      },
      meeting_questions: {
        meeting_id_required: 'Meeting id is required',
        meeting_not_ended: 'Meeting has not ended yet',
        no_context: 'No meeting context is available',
        question_required: 'Question is required'
      },
      meeting_invite: {
        cancelled: 'This meeting was cancelled',
        display_name_required: 'Display name is required',
        ended: 'This meeting has already ended',
        expired: 'This meeting link has expired',
        meeting_not_found: 'Meeting not found',
        not_found: 'Meeting link not found',
        rate_limited: 'Too many invite link attempts. Please wait {retry_after_seconds} seconds and try again.',
        revoked: 'This meeting link is no longer valid',
        token_required: 'Token is required'
      },
      password_reset: {
        already_used: 'This reset link has already been used',
        email_required: 'Email is required',
        expired: 'This reset link has expired',
        invalid_token: 'This reset link is invalid',
        rate_limited: 'Too many password reset attempts. Please wait {retry_after_seconds} seconds and try again.',
        token_required: 'Token is required'
      },
      password_change: {
        authentication_required: 'Authentication required',
        guest_accounts_forbidden: 'Guest accounts cannot change passwords',
        invalid_current_password: 'Your current password is incorrect'
      },
      password_policy: {
        requirements_not_met: 'Your password does not meet the configured password requirements.'
      },
      self_registration: {
        disabled: 'Self-registration is disabled.',
        domain_not_allowed: 'This email domain is not allowed to register.',
        email_already_registered: 'This email address is already registered.',
        invalid_allowed_domain: 'One or more allowed email domains are invalid.',
        invalid_token: 'This confirmation link is invalid.',
        rate_limited: 'Too many registration attempts. Please wait {retry_after_seconds} seconds and try again.',
        token_already_used: 'This confirmation link has already been used.',
        token_expired: 'This confirmation link has expired.',
        token_required: 'A confirmation token is required.'
      },
      pending_registrations: {
        not_found: 'Pending registration not found.',
        unknown_action: 'Unknown registration action.'
      },
      primary_admin: {
        cannot_delete_primary_admin: 'The primary admin account cannot be deleted',
        cannot_manage_primary_admin: 'The primary admin account cannot be deactivated or reactivated',
        confirmation_required: 'Type TRANSFER_PRIMARY_ADMIN to confirm this irreversible transfer',
        current_password_required: 'Current password is required',
        current_primary_admin_required: 'Only the current primary admin can transfer this role',
        invalid_current_password: 'Your current password is incorrect',
        invalid_passkey_challenge: 'The passkey security check expired or is invalid',
        invalid_passkey_reauth: 'Passkey security check is invalid',
        no_passkey_available: 'No passkey is available for this account',
        passkey_authentication_failed: 'Passkey security check failed',
        passkey_not_found: 'Passkey credential not found',
        rate_limited: 'Too many transfer attempts. Please wait {retry_after_seconds} seconds and try again.',
        reauth_required: 'Password or passkey security check is required',
        self_transfer_not_allowed: 'Primary admin cannot be transferred to the same account',
        target_must_be_active_member: 'Target user must be an active member account',
        target_required: 'Target user is required',
        unexpected_error: 'Primary admin transfer failed'
      },
      sponsorship: {
        enabled_required: 'The sponsorship notice setting must be enabled or disabled.',
        primary_admin_required: 'Only the primary admin can manage sponsorship notices.',
        unexpected_error: 'Sponsorship notice request failed.'
      },
      passkeys: {
        authentication_failed: 'Passkey authentication failed',
        credential_already_registered: 'This passkey is already registered',
        credential_not_found: 'Passkey credential not found',
        guest_accounts_forbidden: 'Guest accounts cannot use passkeys',
        invalid_authentication_challenge: 'The passkey sign-in challenge is invalid or expired',
        invalid_registration_challenge: 'The passkey registration challenge is invalid or expired',
        rate_limited: 'Too many passkey attempts. Please wait {retry_after_seconds} seconds and try again.',
        not_found: 'Passkey not found',
        registration_failed: 'Passkey registration failed',
        unexpected_error: 'Passkey request failed'
      },
      meetings: {
        authentication_required: 'Authentication required',
        cancel_forbidden: 'Only the host or an admin can cancel this meeting',
        cancel_only_scheduled: 'Only scheduled meetings can be cancelled',
        decline_only_invited_allowed: 'Only invited participants can decline this call',
        end_forbidden: 'Only host or admin can end this meeting',
        end_only_active: 'Scheduled meetings must be cancelled instead of ended',
        ics_failed: 'Calendar entry could not be loaded',
        invalid_schedule_window: 'The scheduled meeting end must be after the start',
        invalid_token: 'Invalid token',
        invite_forbidden: 'Only host or authorized channel members can invite',
        invite_link_cancelled: 'Guest links cannot be created for cancelled meetings',
        invite_link_forbidden: 'Only the host or an admin can manage guest links',
        invite_user_ids_required: 'user_ids is required for invite',
        join_not_open_yet: 'This meeting cannot be joined yet',
        manage_forbidden: 'Only the host or an admin can manage this meeting',
        membership_required: 'You are not a participant in this meeting',
        meeting_access_denied: 'No access to this meeting',
        meeting_already_ended: 'Meeting has already ended',
        meeting_id_required: 'Meeting id is required',
        meeting_not_found: 'Meeting not found',
        not_found: 'Meeting not found',
        one_or_more_user_ids_invalid: 'One or more user IDs are invalid',
        participant_already_joined: 'Participant already joined',
        reschedule_forbidden: 'Only the host or an admin can reschedule this meeting',
        reschedule_only_scheduled: 'Only scheduled meetings can be rescheduled',
        scheduled_start_required: 'scheduled_start_at is required',
        set_language_language_required: 'language is required for set_language',
        language_update_forbidden: 'Only the host or an admin can change the meeting language',
        language_update_cancelled: 'Cancelled meetings can no longer change language',
        set_title_forbidden: 'Only host or admin can change the meeting title',
        set_title_title_required: 'title is required for set_title',
        source_channel_access_denied: 'No access to source channel',
        source_channel_archived: 'Archived channels cannot be used as meeting source',
        source_channel_not_found: 'Source channel not found',
        source_context_access_denied: 'No access to this meeting source context',
        source_context_invalid: 'Meeting source context is no longer valid',
        summary_generation_already_processing: 'Summary generation is already running',
        summary_generation_already_ready: 'Summary already exists',
        summary_generation_not_ended: 'Summary can only be generated after the meeting has ended',
        summary_regenerate_forbidden: 'Only admins can regenerate an existing summary',
        summary_generation_unavailable: 'Summary generation is unavailable',
        summary_retry_forbidden: 'Only the host or an admin can retry summary generation',
        audio_download_admin_only: 'Only admins can download meeting audio',
        audio_download_failed: 'Meeting audio could not be downloaded',
        audio_download_read_failed: 'Meeting audio could not be read',
        audio_download_no_recordings: 'No downloadable meeting audio is available',
        audio_download_storage_unavailable: 'Meeting audio download is unavailable',
        transcript_generation_already_processing: 'Transcript generation is already running',
        transcript_generation_already_ready: 'Transcript already exists',
        transcript_generation_no_retryable_recordings: 'No saved recording can be transcribed again',
        transcript_generation_not_ended: 'Transcript can only be retried after the meeting has ended',
        transcript_regenerate_forbidden: 'Only admins can regenerate an existing transcript',
        transcript_generation_unavailable: 'Transcript generation is unavailable',
        transcript_retry_forbidden: 'Only the host or an admin can retry transcript generation',
        transcription_recording_control_forbidden: 'Only the host or an admin can control transcription recording',
        transcription_recording_not_active: 'Transcription recording can only be controlled in active meetings',
        transcription_recording_unavailable: 'Transcription recording is unavailable',
        unknown_action: 'Unknown meeting action'
      },
      message_search: {
        cursor_pair_required: 'before_created_at and before_id must be set together',
        query_required: 'Search query is required',
        query_too_short: 'Search query is too short'
      },
      message_summaries: {
        authentication_required: 'Authentication required',
        channel_id_required: 'channel_id is required',
        message_id_required: 'message_id is required',
        no_source_messages: 'No messages are available for summarization',
        not_found: 'Message summary not found',
        range_required: 'Choose a time range',
        range_invalid: 'Custom summary ranges must be positive',
        scope_invalid: 'Invalid summary scope',
        selection_invalid: 'Select between two and one hundred messages',
        source_messages_invalid: 'One or more messages cannot be summarized',
        source_too_large: 'The selected messages exceed the summary context limit',
        source_too_short: 'The selected messages are too short to summarize',
        window_invalid: 'The selected summary window is invalid',
        window_pair_required: 'Summary window start and end must be set together'
      },
      message_reminders: {
        id_required: 'Reminder ID is required',
        invalid_remind_at: 'Invalid reminder time',
        invalid_status: 'Invalid reminder status',
        message_id_required: 'message_id is required',
        not_found: 'Reminder not found',
        remind_at_must_be_future: 'Reminder time must be in the future'
      },
      mentions: {
        channel_access_denied: 'No access to this channel',
        only_own_mentions_allowed: 'Only your own mentions are allowed',
        user_or_message_required: 'user_id or message_id is required'
      },
      mistral: {
        ai: 'Mistral API'
      },
      messages: {
        channel_archived: 'Channel is archived',
        channel_id_required: 'channel_id is required',
        forward_content_required: 'Forwarded message is empty',
        forward_metadata_forbidden: 'Forward metadata is only allowed through the forward endpoint',
        invalid_source_link: 'Invalid message link',
        message_not_found: 'Message not found',
        reply_must_stay_in_channel: 'Replies must stay in the same channel'
      },
      notifications: {
        access_denied: 'Access denied',
        notification_not_found: 'Notification not found'
      },
      permissions: {
        missing_required_permission: 'Missing permission: {required}'
      },
      pinned_messages: {
        message_already_pinned: 'Message is already pinned',
        message_not_in_channel: 'Message does not belong to this channel',
        pin_not_found: 'Pin not found'
      },
      platform: {
        already_initialized: 'Platform is already initialized'
      },
      platform_updates: {
        admin_required: 'Only platform administrators can access update information',
        checks_disabled: 'Update checks are disabled',
        confirmation_required: 'Enter the required confirmation phrase',
        enabled_required: 'The update-check setting is invalid',
        primary_admin_required: 'Only the platform owner can manage update checks',
        rate_limited: 'Too many update requests. Please try again later',
        release_not_outstanding: 'One or more selected releases are no longer outstanding',
        unavailable: 'The platform update service is unavailable',
        unexpected_error: 'The update request failed unexpectedly',
        versions_invalid: 'The selected releases are invalid',
        versions_required: 'Select at least one release'
      },
      presence: {
        active_channel_invalid: 'Active channel is invalid',
        connection_required: 'Connection is required',
        last_activity_invalid: 'Last activity timestamp is invalid',
        socket_only: 'Presence updates require a socket connection'
      },
      push_subscriptions: {
        access_denied: 'Access denied',
        not_found: 'Push subscription not found'
      },
      reactions: {
        reaction_not_found: 'Reaction not found'
      },
      roles: {
        system_roles_cannot_be_deleted: 'System roles cannot be deleted'
      },
      openai: {
        com: 'OpenAI API'
      },
      search: {
        cursor_pair_required: 'before_created_at and before_id must be set together',
        invalid_document_type: 'Invalid document type',
        query_or_filter_required: 'Search query or at least one filter is required',
        query_too_short: 'Search query is too short'
      },
      smtp: {
        '': 'SMTP delivery failed',
        connection_failed: 'SMTP connection failed',
        delivery_failed: 'SMTP delivery failed',
        no_accepted_recipients: 'The SMTP server did not accept the recipient',
        not_configured: 'SMTP is not configured',
        test_recipient_required: 'A recipient email address is required for the test mail',
        unknown_action: 'Unknown SMTP action'
      },
      sensitive_reauth: {
        current_password_required: 'Enter your current password',
        invalid_current_password: 'The current password is incorrect',
        invalid_passkey_challenge: 'The passkey request has expired or is invalid',
        invalid_passkey_reauth: 'The passkey confirmation is invalid',
        no_passkey_available: 'No passkey is registered for this account',
        passkey_authentication_failed: 'Passkey confirmation failed',
        passkey_not_found: 'The selected passkey was not found',
        reauth_required: 'Confirm this action with your password or passkey'
      },
      upload: {
        authentication_required: 'Authentication required',
        file_upload_failed: 'File upload failed',
        storage_unavailable: 'File storage is unavailable',
        invalid_token: 'Invalid token',
        missing_permission_upload_files: 'Missing permission: upload_files',
        multipart_parse_failed: 'Upload failed',
        no_file_provided: 'No file provided',
        voice_message_audio_required: 'Voice messages must be audio files'
      },
      video_backgrounds: {
        authentication_required: 'Authentication required',
        delete_forbidden: 'You can only delete your own backgrounds or global backgrounds you manage',
        image_generation_provider_unsupported: 'The configured provider does not support background image generation',
        image_generation_unavailable: 'Background image generation is not available',
        invalid_image: 'Invalid background image',
        invalid_token: 'Invalid token',
        manage_forbidden: 'Missing permission: manage_video_backgrounds',
        method_not_allowed: 'Method not allowed',
        no_file_provided: 'No file provided',
        not_found: 'Background not found',
        processing_failed: 'Background image could not be processed',
        prompt_required: 'Prompt is required',
        publish_foreign_private_forbidden: 'Only the owner can publish a private background',
        storage_unavailable: 'Background storage is unavailable',
        unsupported_image_type: 'Unsupported image type',
        update_forbidden: 'You can only update your own backgrounds or global backgrounds you manage',
        upload_failed: 'Background upload failed'
      },
      voice_drafts: {
        audio_required: 'Voice drafts must be audio files',
        authentication_required: 'Authentication required',
        channel_id_required: 'channel_id is required',
        invalid_token: 'Invalid token',
        multipart_parse_failed: 'Voice draft upload failed',
        no_file_provided: 'No file provided',
        transcription_failed: 'Voice draft transcription failed'
      },
      voice_messages: {
        artifact_not_found: 'Voice message result not found',
        authentication_required: 'Authentication required',
        storage_unavailable: 'Voice message storage is unavailable',
        voice_file_required: 'Voice message result needs an audio voice message'
      },
      avatar: {
        authentication_required: 'Authentication required',
        could_not_optimize_image: 'The image could not be compressed enough for an avatar',
        invalid_image: 'Invalid image file',
        invalid_token: 'Invalid token',
        multipart_parse_failed: 'Upload failed',
        no_file_provided: 'No file provided',
        not_found: 'Avatar not found',
        storage_unavailable: 'Avatar storage unavailable',
        unsupported_image_type: 'Unsupported image type',
        upload_failed: 'Avatar upload failed'
      },
      users: {
        avatar_updates_use_avatar_endpoint: 'Avatar updates must use the avatar endpoint',
        account_state_requires_user_id: 'Account state can only be changed for an individual user',
        cannot_manage_own_account: 'You cannot deactivate or delete your own account',
        direct_creation_not_allowed: 'Direct user creation is not allowed',
        not_found: 'User not found',
        video_background_image_required: 'Choose a background image',
        video_background_not_accessible: 'This background image is not accessible'
      },
      two_factor: {
        already_enabled: 'Two-factor authentication is already enabled',
        guest_accounts_forbidden: 'Guest accounts cannot use two-factor authentication',
        invalid_code: 'The authentication code is invalid',
        invalid_login_challenge: 'The two-factor login challenge is invalid or expired',
        not_enabled: 'Two-factor authentication is not enabled',
        setup_required: 'Start two-factor setup before confirming it',
        unexpected_error: 'Two-factor authentication request failed'
      },
      validation: {
        failed: 'Validation failed'
      },
      voice: {
        channel_access_denied: 'No access to this channel',
        channel_archived: 'Channel is archived',
        channel_not_found: 'Channel not found',
        channel_not_voice: 'Not a voice channel',
        missing_join_voice_permission: 'Missing permission: {permission}',
        not_in_voice_channel: 'Not in voice channel'
      }
    }
  },
  de: {
    api: {
      authentication: {
        account_disabled: 'Dieses Konto ist deaktiviert',
        account_pending: 'Dieses Konto ist noch nicht aktiv',
        authentication_required: 'Authentifizierung erforderlich',
        invalid_credentials: 'E-Mail oder Passwort ist falsch',
        invalid_token: 'Ungueltiges Token',
        rate_limited: 'Zu viele Versuche. Bitte warte {retry_after_seconds} Sekunden und versuche es erneut.'
      },
      auth_login: {
        unexpected_error: 'Login ist unerwartet fehlgeschlagen'
      },
      auth_session: {
        authentication_required: 'Authentifizierung erforderlich',
        invalid_csrf_token: 'Die Sicherheitspruefung deiner Sitzung ist fehlgeschlagen. Bitte melde dich erneut an.',
        invalid_refresh_token: 'Deine Sitzung ist abgelaufen. Bitte melde dich erneut an.',
        refresh_session_expired: 'Deine Sitzung ist abgelaufen. Bitte melde dich erneut an.',
        unexpected_error: 'Sitzungsverarbeitung fehlgeschlagen'
      },
      ai: {
        base_url_dns_lookup_failed: 'Der Host der AI-Provider-Base-URL konnte in Produktion nicht aufgeloest werden',
        base_url_https_required: 'Die AI-Provider-Base-URL muss in Produktion HTTPS verwenden',
        base_url_invalid: 'Die AI-Provider-Base-URL muss eine absolute HTTP(S)-URL ohne Zugangsdaten, Query-String oder Fragment sein',
        base_url_not_supported_for_provider: 'Eine benutzerdefinierte Base-URL ist nur fuer OpenAI-kompatible Provider erlaubt',
        base_url_private_host_forbidden: 'Die AI-Provider-Base-URL darf in Produktion nicht auf localhost oder private Netzadressen zeigen',
        base_url_required: 'Base URL ist fuer diesen Provider erforderlich',
        capability_not_supported: 'Dieser Provider unterstuetzt die gewaehlte AI-Funktion nicht',
        function_config_incomplete: 'Diese AI-Funktion braucht einen aktiven Provider und ein Modell',
        function_config_not_found: 'AI-Funktionskonfiguration nicht gefunden',
        image_generation_provider_unsupported: 'Dieser Provider unterstuetzt keine Bildgenerierung',
        model_cache_invalid: 'Gespeicherter Model-Cache ist ungueltig',
        model_fetch_failed: 'Modelle konnten nicht geladen werden',
        models_query_invalid: 'provider_instance_id und capability sind erforderlich',
        provider_capability_mismatch: 'Dieser Provider-Typ unterstuetzt die AI-Funktion nicht',
        provider_instance_disabled: 'Aktive AI-Funktionen duerfen keine deaktivierte Provider-Instanz nutzen',
        provider_instance_in_use: 'Provider-Instanz ist noch einer AI-Funktion zugeordnet',
        provider_instance_not_found: 'AI-Provider-Instanz nicht gefunden',
        provider_secret_not_found: 'AI-Provider-Secret nicht gefunden',
        provider_type_immutable: 'Provider-Typ kann nicht geaendert werden',
        provider_type_invalid: 'Unbekannter AI-Provider-Typ'
      },
      anthropic: {
        com: 'Anthropic API'
      },
      channel_members: {
        channel_id_required: 'channel_id ist erforderlich',
        membership_not_found: 'Mitgliedschaft nicht gefunden'
      },
      channel_read_state: {
        unsupported_target: 'Nicht unterstuetztes Read-State-Ziel'
      },
      channels: {
        channel_not_found: 'Channel nicht gefunden',
        dm_member_removal_not_supported: 'Mitglieder koennen nicht aus Direct Chats entfernt werden',
        membership_not_found: 'Nicht Mitglied dieses Channels',
        membership_required: 'Du bist kein Mitglied dieses Channels',
        not_found: 'Channel nicht gefunden',
        one_or_more_user_ids_invalid: 'Eine oder mehrere User-IDs sind ungueltig',
        self_join_public_only: 'Self-Join ist nur fuer aktive oeffentliche Channels erlaubt',
        self_leave_not_supported: 'Verlassen wird fuer diesen Channel-Typ nicht unterstuetzt'
      },
      dms: {
        conversation_access_denied: 'Kein Zugriff auf diese Konversation',
        dm_not_found: 'DM nicht gefunden',
        guest_accounts_forbidden: 'Gast-Konten duerfen keine Direktnachrichten verwenden',
        meeting_history_access_forbidden: 'Nur der Gruppen-Owner oder ein Plattform-Admin kann den Zugriff auf vergangene Meetings aendern',
        one_or_more_user_ids_invalid: 'Eine oder mehrere User-IDs sind ungueltig',
        only_group_dms_editable: 'Nur Gruppen-DMs koennen bearbeitet werden',
        user_ids_must_not_contain_self: 'user_ids darf die eigene ID nicht enthalten'
      },
      files: {
        access_other_users_files_denied: 'Kein Zugriff auf Dateien anderer Nutzer',
        channel_access_denied: 'Kein Zugriff auf diesen Channel',
        delete_owner_only: 'Nur der Eigentuemer kann diese Datei loeschen',
        file_access_denied: 'Kein Zugriff auf diese Datei',
        file_not_found: 'Datei nicht gefunden'
      },
      invite_accept: {
        completion_failed: 'Einladung konnte nicht vollstaendig abgeschlossen werden',
        invite_expired: 'Einladung ist abgelaufen',
        invite_not_found: 'Einladung nicht gefunden',
        invite_not_found_or_used: 'Einladung nicht gefunden oder bereits verwendet',
        rate_limited: 'Zu viele Einladungsversuche. Bitte warte {retry_after_seconds} Sekunden und versuche es erneut.',
        token_required: 'Token ist erforderlich',
        user_with_email_exists: 'Ein Nutzer mit dieser E-Mail existiert bereits'
      },
      invites: {
        only_revoke_status_change_allowed: 'Einladungen koennen nur widerrufen werden',
        pending_invite_for_email_already_exists: 'Es gibt bereits eine ausstehende Einladung fuer diese E-Mail',
        user_with_email_already_exists: 'Ein Nutzer mit dieser E-Mail existiert bereits'
      },
      livekit_webhook: {
        unauthorized: 'Unautorisiert'
      },
      klipy: {
        com: 'KLIPY API'
      },
      meeting_questions: {
        meeting_id_required: 'Meeting-ID ist erforderlich',
        meeting_not_ended: 'Meeting ist noch nicht beendet',
        no_context: 'Kein Meeting-Kontext verfuegbar',
        question_required: 'Frage ist erforderlich'
      },
      meeting_invite: {
        cancelled: 'Dieses Meeting wurde abgesagt',
        display_name_required: 'Anzeigename ist erforderlich',
        ended: 'Dieses Meeting ist bereits beendet',
        expired: 'Dieser Meeting-Link ist abgelaufen',
        meeting_not_found: 'Meeting nicht gefunden',
        not_found: 'Meeting-Link nicht gefunden',
        rate_limited: 'Zu viele Meeting-Link-Versuche. Bitte warte {retry_after_seconds} Sekunden und versuche es erneut.',
        revoked: 'Dieser Meeting-Link ist nicht mehr gueltig',
        token_required: 'Token ist erforderlich'
      },
      password_reset: {
        already_used: 'Dieser Reset-Link wurde bereits verwendet',
        email_required: 'E-Mail ist erforderlich',
        expired: 'Dieser Reset-Link ist abgelaufen',
        invalid_token: 'Dieser Reset-Link ist ungueltig',
        rate_limited: 'Zu viele Passwort-Reset-Versuche. Bitte warte {retry_after_seconds} Sekunden und versuche es erneut.',
        token_required: 'Token ist erforderlich'
      },
      password_change: {
        authentication_required: 'Authentifizierung erforderlich',
        guest_accounts_forbidden: 'Gast-Konten koennen ihr Passwort nicht aendern',
        invalid_current_password: 'Dein aktuelles Passwort ist falsch'
      },
      password_policy: {
        requirements_not_met: 'Dein Passwort erfuellt die konfigurierten Anforderungen nicht.'
      },
      self_registration: {
        disabled: 'Die Selbstregistrierung ist deaktiviert.',
        domain_not_allowed: 'Diese E-Mail-Domain ist nicht fuer die Registrierung zugelassen.',
        email_already_registered: 'Diese E-Mail-Adresse ist bereits registriert.',
        invalid_allowed_domain: 'Eine oder mehrere erlaubte E-Mail-Domains sind ungueltig.',
        invalid_token: 'Dieser Bestaetigungslink ist ungueltig.',
        rate_limited: 'Zu viele Registrierungsversuche. Bitte warte {retry_after_seconds} Sekunden und versuche es erneut.',
        token_already_used: 'Dieser Bestaetigungslink wurde bereits verwendet.',
        token_expired: 'Dieser Bestaetigungslink ist abgelaufen.',
        token_required: 'Ein Bestaetigungstoken ist erforderlich.'
      },
      pending_registrations: {
        not_found: 'Ausstehende Anmeldung nicht gefunden.',
        unknown_action: 'Unbekannte Registrierungsaktion.'
      },
      primary_admin: {
        cannot_delete_primary_admin: 'Das Haupt-Admin-Konto kann nicht geloescht werden',
        cannot_manage_primary_admin: 'Das Haupt-Admin-Konto kann nicht deaktiviert oder reaktiviert werden',
        confirmation_required: 'Gib TRANSFER_PRIMARY_ADMIN ein, um diese unumkehrbare Uebertragung zu bestaetigen',
        current_password_required: 'Aktuelles Passwort ist erforderlich',
        current_primary_admin_required: 'Nur der aktuelle Haupt-Admin kann diese Rolle uebertragen',
        invalid_current_password: 'Dein aktuelles Passwort ist falsch',
        invalid_passkey_challenge: 'Die Passkey-Sicherheitsabfrage ist abgelaufen oder ungueltig',
        invalid_passkey_reauth: 'Die Passkey-Sicherheitsabfrage ist ungueltig',
        no_passkey_available: 'Fuer dieses Konto ist kein Passkey verfuegbar',
        passkey_authentication_failed: 'Die Passkey-Sicherheitsabfrage ist fehlgeschlagen',
        passkey_not_found: 'Passkey-Credential nicht gefunden',
        rate_limited: 'Zu viele Uebertragungsversuche. Bitte warte {retry_after_seconds} Sekunden und versuche es erneut.',
        reauth_required: 'Passwort- oder Passkey-Sicherheitsabfrage ist erforderlich',
        self_transfer_not_allowed: 'Der Haupt-Admin kann nicht auf dasselbe Konto uebertragen werden',
        target_must_be_active_member: 'Das Zielkonto muss ein aktives Mitgliedskonto sein',
        target_required: 'Zielkonto ist erforderlich',
        unexpected_error: 'Haupt-Admin-Uebertragung fehlgeschlagen'
      },
      sponsorship: {
        enabled_required: 'Die Einstellung fuer Spendenhinweise muss aktiviert oder deaktiviert werden.',
        primary_admin_required: 'Nur der Haupt-Admin kann Spendenhinweise verwalten.',
        unexpected_error: 'Anfrage fuer Spendenhinweise fehlgeschlagen.'
      },
      passkeys: {
        authentication_failed: 'Die Passkey-Anmeldung ist fehlgeschlagen',
        credential_already_registered: 'Dieser Passkey ist bereits registriert',
        credential_not_found: 'Passkey-Credential nicht gefunden',
        guest_accounts_forbidden: 'Gast-Konten koennen keine Passkeys verwenden',
        invalid_authentication_challenge: 'Die Passkey-Anmeldeanfrage ist ungueltig oder abgelaufen',
        invalid_registration_challenge: 'Die Passkey-Registrierungsanfrage ist ungueltig oder abgelaufen',
        rate_limited: 'Zu viele Passkey-Versuche. Bitte warte {retry_after_seconds} Sekunden und versuche es erneut.',
        not_found: 'Passkey nicht gefunden',
        registration_failed: 'Die Passkey-Registrierung ist fehlgeschlagen',
        unexpected_error: 'Die Passkey-Anfrage ist fehlgeschlagen'
      },
      meetings: {
        authentication_required: 'Authentifizierung erforderlich',
        cancel_forbidden: 'Nur Host oder Admin kann dieses Meeting absagen',
        cancel_only_scheduled: 'Nur geplante Meetings koennen abgesagt werden',
        decline_only_invited_allowed: 'Nur eingeladene Teilnehmer koennen den Anruf ablehnen',
        end_forbidden: 'Nur Host oder Admin kann dieses Meeting beenden',
        end_only_active: 'Geplante Meetings muessen abgesagt statt beendet werden',
        ics_failed: 'Kalendereintrag konnte nicht geladen werden',
        invalid_schedule_window: 'Das geplante Meeting-Ende muss nach dem Start liegen',
        invalid_token: 'Ungueltiges Token',
        invite_forbidden: 'Nur Host oder berechtigte Channel-Mitglieder duerfen einladen',
        invite_link_cancelled: 'Fuer abgesagte Meetings koennen keine Gast-Links erstellt werden',
        invite_link_forbidden: 'Nur Host oder Admin kann Gast-Links verwalten',
        invite_user_ids_required: 'user_ids ist fuer invite erforderlich',
        join_not_open_yet: 'Dieses Meeting kann noch nicht betreten werden',
        manage_forbidden: 'Nur Host oder Admin darf dieses Meeting verwalten',
        membership_required: 'Du bist kein Teilnehmer dieses Meetings',
        meeting_access_denied: 'Kein Zugriff auf dieses Meeting',
        meeting_already_ended: 'Meeting ist bereits beendet',
        meeting_id_required: 'Meeting-ID ist erforderlich',
        meeting_not_found: 'Meeting nicht gefunden',
        not_found: 'Meeting nicht gefunden',
        one_or_more_user_ids_invalid: 'Eine oder mehrere User-IDs sind ungueltig',
        participant_already_joined: 'Teilnehmer ist bereits beigetreten',
        reschedule_forbidden: 'Nur Host oder Admin kann dieses Meeting verschieben',
        reschedule_only_scheduled: 'Nur geplante Meetings koennen verschoben werden',
        scheduled_start_required: 'scheduled_start_at ist erforderlich',
        set_language_language_required: 'language ist fuer set_language erforderlich',
        language_update_forbidden: 'Nur Host oder Admin kann die Meeting-Sprache aendern',
        language_update_cancelled: 'Abgesagte Meetings koennen keine Sprache mehr aendern',
        set_title_forbidden: 'Nur Host oder Admin kann den Meeting-Titel aendern',
        set_title_title_required: 'title ist fuer set_title erforderlich',
        source_channel_access_denied: 'Kein Zugriff auf den Start-Channel',
        source_channel_archived: 'Archivierter Channel kann kein Startkontext fuer Meetings sein',
        source_channel_not_found: 'Start-Channel nicht gefunden',
        source_context_access_denied: 'Kein Zugriff auf den Startkontext dieses Meetings',
        source_context_invalid: 'Meeting hat keinen gueltigen Startkontext mehr',
        summary_generation_already_processing: 'Zusammenfassung wird bereits erstellt',
        summary_generation_already_ready: 'Zusammenfassung existiert bereits',
        summary_generation_not_ended: 'Zusammenfassung kann erst nach Meeting-Ende erstellt werden',
        summary_regenerate_forbidden: 'Nur Admins koennen eine vorhandene Zusammenfassung neu erstellen',
        summary_generation_unavailable: 'Zusammenfassung ist nicht verfuegbar',
        summary_retry_forbidden: 'Nur Host oder Admin kann die Zusammenfassung erneut starten',
        audio_download_admin_only: 'Nur Admins koennen Meeting-Audio herunterladen',
        audio_download_failed: 'Meeting-Audio konnte nicht heruntergeladen werden',
        audio_download_read_failed: 'Meeting-Audio konnte nicht gelesen werden',
        audio_download_no_recordings: 'Es ist kein herunterladbares Meeting-Audio verfuegbar',
        audio_download_storage_unavailable: 'Meeting-Audio-Download ist nicht verfuegbar',
        transcript_generation_already_processing: 'Transkript wird bereits erstellt',
        transcript_generation_already_ready: 'Transkript existiert bereits',
        transcript_generation_no_retryable_recordings: 'Keine gespeicherte Aufnahme kann erneut transkribiert werden',
        transcript_generation_not_ended: 'Transkript kann erst nach Meeting-Ende erneut gestartet werden',
        transcript_regenerate_forbidden: 'Nur Admins koennen ein vorhandenes Transkript neu erstellen',
        transcript_generation_unavailable: 'Transkription ist nicht verfuegbar',
        transcript_retry_forbidden: 'Nur Host oder Admin kann das Transkript erneut starten',
        transcription_recording_control_forbidden: 'Nur Host oder Admin kann die Transkriptionsaufnahme steuern',
        transcription_recording_not_active: 'Transkriptionsaufnahme kann nur in aktiven Meetings gesteuert werden',
        transcription_recording_unavailable: 'Transkriptionsaufnahme ist nicht verfuegbar',
        unknown_action: 'Unbekannte Meeting-Action'
      },
      message_search: {
        cursor_pair_required: 'before_created_at und before_id muessen gemeinsam gesetzt werden',
        query_required: 'Suchanfrage ist erforderlich',
        query_too_short: 'Suchanfrage ist zu kurz'
      },
      message_summaries: {
        authentication_required: 'Authentifizierung erforderlich',
        channel_id_required: 'channel_id ist erforderlich',
        message_id_required: 'message_id ist erforderlich',
        no_source_messages: 'Keine Nachrichten fuer eine Zusammenfassung verfuegbar',
        not_found: 'Nachrichten-Zusammenfassung nicht gefunden',
        range_required: 'Waehle einen Zeitraum',
        range_invalid: 'Eigene Zeitraeume muessen positiv sein',
        scope_invalid: 'Ungueltiger Zusammenfassungsbereich',
        selection_invalid: 'Waehle zwischen zwei und einhundert Nachrichten',
        source_messages_invalid: 'Eine oder mehrere Nachrichten koennen nicht zusammengefasst werden',
        source_too_large: 'Die ausgewaehlten Nachrichten ueberschreiten das Kontextlimit fuer Zusammenfassungen',
        source_too_short: 'Die ausgewaehlten Nachrichten sind zu kurz fuer eine Zusammenfassung',
        window_invalid: 'Das ausgewaehlte Zusammenfassungsfenster ist ungueltig',
        window_pair_required: 'Start und Ende des Zusammenfassungsfensters muessen gemeinsam gesetzt werden'
      },
      message_reminders: {
        id_required: 'Reminder-ID ist erforderlich',
        invalid_remind_at: 'Ungueltige Erinnerungszeit',
        invalid_status: 'Ungueltiger Erinnerungsstatus',
        message_id_required: 'message_id ist erforderlich',
        not_found: 'Erinnerung nicht gefunden',
        remind_at_must_be_future: 'Erinnerungszeit muss in der Zukunft liegen'
      },
      mentions: {
        channel_access_denied: 'Kein Zugriff auf diesen Channel',
        only_own_mentions_allowed: 'Nur eigene Mentions sind erlaubt',
        user_or_message_required: 'user_id oder message_id ist erforderlich'
      },
      mistral: {
        ai: 'Mistral API'
      },
      messages: {
        channel_archived: 'Channel ist archiviert',
        channel_id_required: 'channel_id ist erforderlich',
        forward_content_required: 'Weitergeleitete Nachricht ist leer',
        forward_metadata_forbidden: 'Forward-Metadaten sind nur ueber den Forward-Pfad erlaubt',
        invalid_source_link: 'Ungueltiger Nachrichten-Link',
        message_not_found: 'Nachricht nicht gefunden',
        reply_must_stay_in_channel: 'Antworten muessen im selben Channel bleiben'
      },
      notifications: {
        access_denied: 'Zugriff verweigert',
        notification_not_found: 'Benachrichtigung nicht gefunden'
      },
      permissions: {
        missing_required_permission: 'Fehlende Berechtigung: {required}'
      },
      pinned_messages: {
        message_already_pinned: 'Nachricht ist bereits angepinnt',
        message_not_in_channel: 'Nachricht gehoert nicht zu diesem Channel',
        pin_not_found: 'Pin nicht gefunden'
      },
      platform: {
        already_initialized: 'Plattform ist bereits initialisiert'
      },
      platform_updates: {
        admin_required: 'Nur Plattform-Administratoren dürfen Update-Informationen abrufen',
        checks_disabled: 'Die Update-Prüfung ist deaktiviert',
        confirmation_required: 'Gib die erforderliche Bestätigungsphrase ein',
        enabled_required: 'Die Einstellung für Update-Prüfungen ist ungültig',
        primary_admin_required: 'Nur der Plattform-Owner darf Update-Prüfungen verwalten',
        rate_limited: 'Zu viele Update-Anfragen. Bitte versuche es später erneut',
        release_not_outstanding: 'Mindestens eine ausgewählte Version ist nicht mehr ausstehend',
        unavailable: 'Der Plattform-Update-Dienst ist nicht verfügbar',
        unexpected_error: 'Die Update-Anfrage ist unerwartet fehlgeschlagen',
        versions_invalid: 'Die ausgewählten Versionen sind ungültig',
        versions_required: 'Wähle mindestens eine Version aus'
      },
      presence: {
        active_channel_invalid: 'Aktiver Channel ist ungueltig',
        connection_required: 'Verbindung ist erforderlich',
        last_activity_invalid: 'Letzte Aktivitaet ist ungueltig',
        socket_only: 'Presence-Updates brauchen eine Socket-Verbindung'
      },
      push_subscriptions: {
        access_denied: 'Zugriff verweigert',
        not_found: 'Push-Abonnement nicht gefunden'
      },
      reactions: {
        reaction_not_found: 'Reaktion nicht gefunden'
      },
      roles: {
        system_roles_cannot_be_deleted: 'System-Rollen koennen nicht geloescht werden'
      },
      openai: {
        com: 'OpenAI API'
      },
      search: {
        cursor_pair_required: 'before_created_at und before_id muessen gemeinsam gesetzt werden',
        invalid_document_type: 'Ungueltiger Dokumenttyp',
        query_or_filter_required: 'Suchanfrage oder mindestens ein Filter ist erforderlich',
        query_too_short: 'Suchanfrage ist zu kurz'
      },
      smtp: {
        '': 'SMTP-Zustellung fehlgeschlagen',
        connection_failed: 'SMTP-Verbindung fehlgeschlagen',
        delivery_failed: 'SMTP-Zustellung fehlgeschlagen',
        no_accepted_recipients: 'Der SMTP-Server hat den Empfaenger nicht akzeptiert',
        not_configured: 'SMTP ist nicht konfiguriert',
        test_recipient_required: 'Fuer die Testmail ist eine Empfaengeradresse erforderlich',
        unknown_action: 'Unbekannte SMTP-Aktion'
      },
      sensitive_reauth: {
        current_password_required: 'Gib dein aktuelles Passwort ein',
        invalid_current_password: 'Das aktuelle Passwort ist falsch',
        invalid_passkey_challenge: 'Die Passkey-Anfrage ist abgelaufen oder ungültig',
        invalid_passkey_reauth: 'Die Passkey-Bestätigung ist ungültig',
        no_passkey_available: 'Für dieses Konto ist kein Passkey registriert',
        passkey_authentication_failed: 'Die Passkey-Bestätigung ist fehlgeschlagen',
        passkey_not_found: 'Der ausgewählte Passkey wurde nicht gefunden',
        reauth_required: 'Bestätige diese Aktion mit deinem Passwort oder Passkey'
      },
      upload: {
        authentication_required: 'Authentifizierung erforderlich',
        file_upload_failed: 'Datei-Upload fehlgeschlagen',
        storage_unavailable: 'Dateispeicher ist nicht verfuegbar',
        invalid_token: 'Ungueltiges Token',
        missing_permission_upload_files: 'Fehlende Berechtigung: upload_files',
        multipart_parse_failed: 'Upload fehlgeschlagen',
        no_file_provided: 'Keine Datei bereitgestellt',
        voice_message_audio_required: 'Sprachnachrichten muessen Audiodateien sein'
      },
      video_backgrounds: {
        authentication_required: 'Authentifizierung erforderlich',
        delete_forbidden: 'Du kannst nur eigene Hintergruende oder verwaltete globale Hintergruende loeschen',
        image_generation_provider_unsupported: 'Der konfigurierte Provider unterstuetzt keine Hintergrundbild-Generierung',
        image_generation_unavailable: 'Hintergrundbild-Generierung ist nicht verfuegbar',
        invalid_image: 'Ungueltiges Hintergrundbild',
        invalid_token: 'Ungueltiges Token',
        manage_forbidden: 'Fehlende Berechtigung: manage_video_backgrounds',
        method_not_allowed: 'Methode nicht erlaubt',
        no_file_provided: 'Keine Datei bereitgestellt',
        not_found: 'Hintergrund nicht gefunden',
        processing_failed: 'Hintergrundbild konnte nicht verarbeitet werden',
        prompt_required: 'Prompt ist erforderlich',
        publish_foreign_private_forbidden: 'Nur der Eigentuemer kann einen privaten Hintergrund freigeben',
        storage_unavailable: 'Hintergrund-Speicher ist nicht verfuegbar',
        unsupported_image_type: 'Nicht unterstuetzter Bildtyp',
        update_forbidden: 'Du kannst nur eigene Hintergruende oder verwaltete globale Hintergruende aktualisieren',
        upload_failed: 'Hintergrund-Upload fehlgeschlagen'
      },
      voice_drafts: {
        audio_required: 'Sprachentwuerfe muessen Audiodateien sein',
        authentication_required: 'Authentifizierung erforderlich',
        channel_id_required: 'channel_id ist erforderlich',
        invalid_token: 'Ungueltiges Token',
        multipart_parse_failed: 'Sprachentwurf-Upload fehlgeschlagen',
        no_file_provided: 'Keine Datei bereitgestellt',
        transcription_failed: 'Sprachentwurf konnte nicht transkribiert werden'
      },
      voice_messages: {
        artifact_not_found: 'Sprachnachricht-Auswertung nicht gefunden',
        authentication_required: 'Authentifizierung erforderlich',
        storage_unavailable: 'Sprachnachricht-Speicher ist nicht verfuegbar',
        voice_file_required: 'Sprachnachricht-Auswertung braucht eine Audio-Sprachnachricht'
      },
      avatar: {
        authentication_required: 'Authentifizierung erforderlich',
        could_not_optimize_image: 'Das Bild konnte nicht klein genug fuer einen Avatar komprimiert werden',
        invalid_image: 'Ungueltige Bilddatei',
        invalid_token: 'Ungueltiges Token',
        multipart_parse_failed: 'Upload fehlgeschlagen',
        no_file_provided: 'Keine Datei bereitgestellt',
        not_found: 'Avatar nicht gefunden',
        storage_unavailable: 'Avatar-Speicher ist nicht verfuegbar',
        unsupported_image_type: 'Nicht unterstuetzter Bildtyp',
        upload_failed: 'Avatar-Upload fehlgeschlagen'
      },
      users: {
        avatar_updates_use_avatar_endpoint: 'Avatar-Aenderungen muessen ueber den Avatar-Endpunkt erfolgen',
        account_state_requires_user_id: 'Der Kontostatus kann nur fuer einen einzelnen Nutzer geaendert werden',
        cannot_manage_own_account: 'Du kannst dein eigenes Konto nicht deaktivieren oder loeschen',
        direct_creation_not_allowed: 'Direkte Benutzererstellung ist nicht erlaubt',
        not_found: 'Nutzer nicht gefunden',
        video_background_image_required: 'Waehle ein Hintergrundbild aus',
        video_background_not_accessible: 'Dieses Hintergrundbild ist nicht verfuegbar'
      },
      two_factor: {
        already_enabled: 'Die Zwei-Faktor-Authentifizierung ist bereits aktiv',
        guest_accounts_forbidden: 'Gast-Konten koennen keine Zwei-Faktor-Authentifizierung verwenden',
        invalid_code: 'Der Authentifizierungscode ist ungueltig',
        invalid_login_challenge: 'Die Zwei-Faktor-Anmeldeanfrage ist ungueltig oder abgelaufen',
        not_enabled: 'Die Zwei-Faktor-Authentifizierung ist nicht aktiv',
        setup_required: 'Starte zuerst die Zwei-Faktor-Einrichtung',
        unexpected_error: 'Die Zwei-Faktor-Anfrage ist fehlgeschlagen'
      },
      validation: {
        failed: 'Validierungsfehler'
      },
      voice: {
        channel_access_denied: 'Kein Zugriff auf diesen Channel',
        channel_archived: 'Channel ist archiviert',
        channel_not_found: 'Channel nicht gefunden',
        channel_not_voice: 'Kein Voice-Channel',
        missing_join_voice_permission: 'Fehlende Berechtigung: {permission}',
        not_in_voice_channel: 'Nicht im Voice-Channel'
      }
    }
  }
}
