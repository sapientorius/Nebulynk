<?php

class Modules_NebulynkPlesk_Task_Deployment extends pm_LongTask_Task
{
    public $trackProgress = true;

    public function run()
    {
        $action = (string)$this->getParam('action');
        $this->updateProgress(5);
        Modules_NebulynkPlesk_Deployment::setDeploymentStatus($action === 'preflight' ? 'checking' : 'running');

        if (in_array($action, ['install', 'update', 'start', 'restart'], true)) {
            $this->updateProgress(20);
        }

        $helperArguments = [];
        $domain = (string)$this->getParam('domain');
        $port = (string)$this->getParam('port');
        if ($domain !== '') {
            $helperArguments[] = '--domain';
            $helperArguments[] = $domain;
        }
        if ($port !== '') {
            $helperArguments[] = '--port';
            $helperArguments[] = $port;
        }

        Modules_NebulynkPlesk_Deployment::callHelper($action, $helperArguments);
        if ((string)$this->getParam('activate_proxy') === '1') {
            Modules_NebulynkPlesk_Deployment::setProxyEnabled(true);
        }
        $this->updateProgress(95);
        Modules_NebulynkPlesk_Deployment::markDeploymentSuccessful($action);
        $this->updateProgress(100);
    }

    public function statusMessage()
    {
        $action = (string)$this->getParam('action');
        switch ($this->getStatus()) {
            case static::STATUS_RUNNING:
                return 'Nebulynk: ' . $action . ' läuft';
            case static::STATUS_DONE:
                return 'Nebulynk: ' . $action . ' abgeschlossen';
            default:
                return 'Nebulynk: ' . $action;
        }
    }

    public function onError(Exception $e)
    {
        Modules_NebulynkPlesk_Deployment::setDeploymentStatus('error');
    }
}
