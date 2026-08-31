<?php

pm_Context::init('nebulynk-plesk');

if (!pm_Settings::get('deployment_root')) {
    pm_Settings::set('deployment_root', Modules_NebulynkPlesk_Deployment::DEPLOYMENT_ROOT);
}
if (!pm_Settings::get('compose_project')) {
    pm_Settings::set('compose_project', Modules_NebulynkPlesk_Deployment::COMPOSE_PROJECT);
}
if (pm_Settings::get('proxy_enabled') === null || pm_Settings::get('proxy_enabled') === false) {
    pm_Settings::set('proxy_enabled', '0');
}
if (!pm_Settings::get('deployment_status')) {
    pm_Settings::set('deployment_status', 'unconfigured');
}

$helper = '/usr/local/psa/admin/bin/modules/nebulynk-plesk/nebulynk-plesk';
if (is_file($helper)) {
    @chmod($helper, 0750);
}
