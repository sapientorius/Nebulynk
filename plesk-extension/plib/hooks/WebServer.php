<?php

class Modules_NebulynkPlesk_WebServer extends pm_Hook_WebServer
{
    public function getDomainNginxConfig(pm_Domain $domain)
    {
        return Modules_NebulynkPlesk_Deployment::renderNginxConfiguration($domain);
    }

    public function getDomainNginxProxyConfig(pm_Domain $domain)
    {
        return Modules_NebulynkPlesk_Deployment::renderNginxConfiguration($domain);
    }
}
