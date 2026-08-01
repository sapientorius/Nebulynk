export const backendMessages = {
  de: {
    email: {
      invite: {
        copyLink: 'Oder kopiere diesen Link:',
        cta: 'Einladung annehmen',
        heading: 'Einladung zu {platformName}',
        intro: '{inviterName} hat dich zu <strong>{platformName}</strong> eingeladen.',
        subject: 'Einladung zu {platformName}'
      },
      passwordReset: {
        copyLink: 'Oder kopiere diesen Link:',
        cta: 'Passwort zuruecksetzen',
        expiry: 'Dieser Link ist aus Sicherheitsgruenden eine Stunde gueltig.',
        heading: 'Passwort fuer {platformName} zuruecksetzen',
        intro: 'Du hast ein neues Passwort fuer <strong>{platformName}</strong> angefordert.',
        subject: 'Passwort fuer {platformName} zuruecksetzen'
      },
      platformSecurityUpdate: {
        subject: '[Security:{severity}] Nebulynk-Update fuer {platformName}',
        heading: 'Security-Update fuer {platformName}',
        intro: 'Die installierte Nebulynk-Version {currentVersion} ist von mindestens einem Security-Hinweis betroffen.',
        target: 'Neueste Version: {latestVersion}',
        cta: 'Update-Details oeffnen',
        footer: 'Pruefe Backup- und Upgrade-Hinweise, bevor du die Plattform aktualisierst.'
      }
    },
    api: {
      messages: {
        forward_content_required: 'Weitergeleitete Nachricht ist leer',
        forward_metadata_forbidden: 'Forward-Metadaten sind nur ueber den Forward-Pfad erlaubt',
        invalid_source_link: 'Ungueltiger Nachrichten-Link',
        reply_must_stay_in_channel: 'Antworten muessen im selben Channel bleiben'
      }
    },
    push: {
      dmTitle: '{actor}',
      mentionTitle: '{actor} hat dich erwaehnt',
      reminderTitle: 'Erinnerung'
    }
  },
  en: {
    email: {
      invite: {
        copyLink: 'Or copy this link:',
        cta: 'Accept invitation',
        heading: 'Invitation to {platformName}',
        intro: '{inviterName} invited you to <strong>{platformName}</strong>.',
        subject: 'Invitation to {platformName}'
      },
      passwordReset: {
        copyLink: 'Or copy this link:',
        cta: 'Reset password',
        expiry: 'For security reasons, this link stays valid for one hour.',
        heading: 'Reset your {platformName} password',
        intro: 'You requested a new password for <strong>{platformName}</strong>.',
        subject: 'Reset your {platformName} password'
      },
      platformSecurityUpdate: {
        subject: '[Security:{severity}] Nebulynk update for {platformName}',
        heading: 'Security update for {platformName}',
        intro: 'The installed Nebulynk version {currentVersion} is affected by at least one security advisory.',
        target: 'Latest version: {latestVersion}',
        cta: 'Open update details',
        footer: 'Review backup and upgrade notes before updating the platform.'
      }
    },
    api: {
      messages: {
        forward_content_required: 'Forwarded message is empty',
        forward_metadata_forbidden: 'Forward metadata is only allowed through the forward endpoint',
        invalid_source_link: 'Invalid message link',
        reply_must_stay_in_channel: 'Replies must stay in the same channel'
      }
    },
    push: {
      dmTitle: '{actor}',
      mentionTitle: '{actor} mentioned you',
      reminderTitle: 'Reminder'
    }
  }
}
