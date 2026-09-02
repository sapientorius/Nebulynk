<?php

pm_Context::init('nebulynk-plesk');

$state = Modules_NebulynkPlesk_Deployment::getState();
if ($state['domain_guid'] !== '') {
    pm_Settings::set('proxy_enabled', '0');
    try {
        Modules_NebulynkPlesk_Deployment::updateDomainConfiguration(
            Modules_NebulynkPlesk_Deployment::getDomainByGuid($state['domain_guid'])
        );
    } catch (Throwable $exception) {
        // A domain may have been removed before the extension itself.
    }

    try {
        Modules_NebulynkPlesk_Deployment::callHelper('stop');
    } catch (Throwable $exception) {
        // Docker may already be unavailable; Plesk can still remove the extension.
    }
}
