<?php

class Modules_NebulynkPlesk_Deployment
{
    public const MODULE_ID = 'nebulynk-plesk';
    public const DEPLOYMENT_ROOT = '/opt/nebulynk-plesk';
    public const COMPOSE_PROJECT = 'nebulynk-plesk';

    private const ALLOWED_TASK_ACTIONS = [
        'preflight',
        'install',
        'update',
        'start',
        'stop',
        'restart',
    ];

    public static function getState(): array
    {
        return [
            'domain_guid' => (string)pm_Settings::get('domain_guid', ''),
            'domain_name' => (string)pm_Settings::get('domain_name', ''),
            'deployment_root' => (string)pm_Settings::get('deployment_root', self::DEPLOYMENT_ROOT),
            'compose_project' => (string)pm_Settings::get('compose_project', self::COMPOSE_PROJECT),
            'edge_port' => (string)pm_Settings::get('edge_port', ''),
            'installed_version' => (string)pm_Settings::get('installed_version', ''),
            'extension_release' => (string)pm_Settings::get('extension_release', ''),
            'deployment_status' => (string)pm_Settings::get('deployment_status', 'unconfigured'),
            'proxy_enabled' => (string)pm_Settings::get('proxy_enabled', '0') === '1',
        ];
    }

    public static function getAvailableDomains(): array
    {
        $domains = [];
        foreach (pm_Domain::getAllDomains(false) as $domain) {
            if (!$domain->isActive()) {
                continue;
            }

            $guid = (string)$domain->getGuid();
            $name = (string)$domain->getName();
            if ($guid === '' || !self::isValidDomainName($name)) {
                continue;
            }

            $domains[$guid] = $domain->getDisplayName() . ' (' . $name . ')';
        }

        asort($domains, SORT_NATURAL | SORT_FLAG_CASE);
        return $domains;
    }

    public static function getDomainByGuid(string $guid): pm_Domain
    {
        if ($guid === '' || strlen($guid) > 128) {
            throw new pm_Exception('Ungültige Plesk-Domain ausgewählt.');
        }

        foreach (pm_Domain::getAllDomains(false) as $domain) {
            if ((string)$domain->getGuid() === $guid) {
                if (!$domain->isActive() || !self::isValidDomainName($domain->getName())) {
                    throw new pm_Exception('Die ausgewählte Domain ist nicht aktiv oder kein gültiger Hostname.');
                }
                return $domain;
            }
        }

        throw new pm_Exception('Die ausgewählte Plesk-Domain wurde nicht gefunden.');
    }

    public static function configureDomain(string $guid, ?bool $enableProxy = null): pm_Domain
    {
        $domain = self::getDomainByGuid($guid);
        self::assertDeployableDomain($domain);
        $state = self::getState();
        $oldGuid = $state['domain_guid'];

        if ($oldGuid !== '' && $oldGuid !== $guid) {
            pm_Settings::set('proxy_enabled', '0');
            try {
                self::updateDomainConfiguration(self::getDomainByGuid($oldGuid));
            } catch (Throwable $exception) {
                // The old domain may have been deleted already.
            }
        }

        $port = $state['edge_port'];
        if (!self::isValidEdgePort($port)) {
            $port = trim((string)self::callHelper('allocate-port', [], pm_ApiCli::RESULT_STDOUT));
            if (!self::isValidEdgePort($port)) {
                throw new pm_Exception('Es konnte kein freier lokaler Edge-Port ermittelt werden.');
            }
        }

        pm_Settings::set('domain_guid', (string)$domain->getGuid());
        pm_Settings::set('domain_name', (string)$domain->getName());
        pm_Settings::set('deployment_root', self::DEPLOYMENT_ROOT);
        pm_Settings::set('compose_project', self::COMPOSE_PROJECT);
        pm_Settings::set('edge_port', $port);
        self::callHelper('check-port', ['--port', $port]);
        $proxyEnabled = $enableProxy ?? ($oldGuid === $guid && $state['proxy_enabled']);
        pm_Settings::set('proxy_enabled', $proxyEnabled ? '1' : '0');
        pm_Settings::set('deployment_status', 'configured');

        self::updateDomainConfiguration($domain);
        return $domain;
    }

    public static function setProxyEnabled(bool $enabled): void
    {
        $state = self::getState();
        if ($state['domain_guid'] === '') {
            throw new pm_Exception('Zuerst muss eine Domain konfiguriert werden.');
        }

        pm_Settings::set('proxy_enabled', $enabled ? '1' : '0');
        self::updateDomainConfiguration(self::getDomainByGuid($state['domain_guid']));
    }

    public static function updateDomainConfiguration(pm_Domain $domain): void
    {
        $webServer = new pm_WebServer();
        $webServer->updateDomainConfiguration(new pm_Domain($domain->getId()));
    }

    public static function renderNginxConfiguration(pm_Domain $domain): string
    {
        $state = self::getState();
        if (!$state['proxy_enabled'] || $state['domain_guid'] === '' || $state['domain_guid'] !== (string)$domain->getGuid()) {
            return '';
        }

        if (!self::isValidEdgePort($state['edge_port'])) {
            return '';
        }

        $port = $state['edge_port'];
        return <<<NGINX

# Nebulynk Plesk integration begin
location ~ ^/(?!\.well-known/acme-challenge(?:/|$)).* {
    proxy_pass http://127.0.0.1:{$port};
    proxy_http_version 1.1;
    proxy_set_header Host \$http_host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_set_header Upgrade \$http_upgrade;
    proxy_set_header Connection \$http_connection;
    proxy_buffering off;
    proxy_read_timeout 3600s;
    proxy_send_timeout 3600s;
    client_max_body_size 100m;
}
# Nebulynk Plesk integration end
NGINX;
    }

    public static function startTask(string $action, bool $activateProxy = false)
    {
        if (!in_array($action, self::ALLOWED_TASK_ACTIONS, true)) {
            throw new pm_Exception('Unbekannte Nebulynk-Aktion.');
        }

        $state = self::getState();
        $task = new Modules_NebulynkPlesk_Task_Deployment();
        $task->setParam('action', $action);
        $task->setParam('domain', $state['domain_name']);
        $task->setParam('port', $state['edge_port']);
        $task->setParam('activate_proxy', $activateProxy ? '1' : '0');
        return (new pm_LongTask_Manager())->start($task);
    }

    public static function callHelper(string $action, array $arguments = [], $result = pm_ApiCli::RESULT_EXCEPTION)
    {
        $allowedActions = array_merge(self::ALLOWED_TASK_ACTIONS, [
            'allocate-port',
            'check-port',
            'configure',
            'status',
            'logs',
            'remove-proxy',
        ]);
        if (!in_array($action, $allowedActions, true)) {
            throw new pm_Exception('Unbekannte Helper-Aktion.');
        }

        return pm_ApiCli::callSbin(
            'nebulynk-plesk',
            array_merge(['--action', $action], $arguments),
            $result
        );
    }

    public static function setDeploymentStatus(string $status): void
    {
        pm_Settings::set('deployment_status', $status);
    }

    public static function markDeploymentSuccessful(string $action): void
    {
        $status = $action === 'stop'
            ? 'stopped'
            : ($action === 'preflight' ? 'ready' : 'running');
        self::setDeploymentStatus($status);

        try {
            $extension = pm_Extension::getById(self::MODULE_ID);
            pm_Settings::set('installed_version', $extension->getVersion());
            pm_Settings::set('extension_release', $extension->getRelease());
        } catch (Throwable $exception) {
            // Deployment remains successful if metadata is temporarily unavailable.
        }
    }

    public static function isValidDomainName(string $name): bool
    {
        return $name !== ''
            && strlen($name) <= 253
            && filter_var($name, FILTER_VALIDATE_DOMAIN, FILTER_FLAG_HOSTNAME) !== false;
    }

    private static function isValidEdgePort(string $port): bool
    {
        return preg_match('/^[0-9]+$/', $port) === 1
            && (int)$port >= 1024
            && (int)$port <= 65535;
    }

    private static function assertDeployableDomain(pm_Domain $domain): void
    {
        if (!$domain->hasHosting()) {
            throw new pm_Exception('Die ausgewählte Domain benötigt physisches Webhosting.');
        }
        if (!$domain->hasSsl()) {
            throw new pm_Exception('Für die ausgewählte Domain muss SSL/TLS in Plesk aktiviert sein.');
        }
        if (method_exists($domain, 'getHostingCertificate') && $domain->getHostingCertificate() === null) {
            throw new pm_Exception('Der ausgewählten Domain ist noch kein Zertifikat zugewiesen.');
        }
        if (method_exists($domain, 'isResolved') && !$domain->isResolved()) {
            throw new pm_Exception('Die ausgewählte Domain ist laut Plesk noch nicht auf diesen Server aufgelöst.');
        }
    }
}
