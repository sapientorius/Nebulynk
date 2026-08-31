<?php

class IndexController extends pm_Controller_Action
{
    protected $_accessLevel = 'admin';

    public function indexAction()
    {
        $this->view->pageTitle = 'Nebulynk';
        $this->view->state = Modules_NebulynkPlesk_Deployment::getState();
        $this->view->domains = Modules_NebulynkPlesk_Deployment::getAvailableDomains();
        $this->view->runtimeStatus = '';
        $this->view->runtimeLogs = '';

        $form = new pm_Form_Simple();
        $form->addElement('select', 'domain_guid', [
            'label' => 'Plesk-Domain',
            'multiOptions' => ['' => 'Bitte auswählen'] + $this->view->domains,
            'value' => $this->view->state['domain_guid'],
            'required' => true,
            'validators' => [['NotEmpty', true]],
        ]);
        $form->addElement('select', 'operation', [
            'label' => 'Aktion',
            'multiOptions' => [
                'preflight' => '1. Vorabprüfung starten (empfohlen)',
                'install' => '2. Installieren und bauen',
                'update' => 'Aktualisieren und neu bauen',
                'start' => 'Starten',
                'stop' => 'Stoppen',
                'restart' => 'Neu starten',
                'status' => 'Containerstatus anzeigen',
                'logs' => 'Letzte Logs anzeigen',
                'proxy-on' => 'Plesk-Proxy aktivieren',
                'proxy-off' => 'Plesk-Proxy deaktivieren',
            ],
            'value' => 'preflight',
            'required' => true,
        ]);
        $form->addControlButtons([
            'cancelLink' => pm_Context::getModulesListUrl(),
        ]);

        if ($this->getRequest()->isPost() && $form->isValid($this->getRequest()->getPost())) {
            $operation = (string)$form->getValue('operation');
            try {
                $this->handleOperation($operation, (string)$form->getValue('domain_guid'));
            } catch (Throwable $exception) {
                $this->_status->addMessage('error', $exception->getMessage());
            }
        }

        $this->view->form = $form;
    }

    private function handleOperation(string $operation, string $domainGuid): void
    {
        $taskOperations = ['preflight', 'install', 'update', 'start', 'stop', 'restart'];
        if ($operation === 'preflight') {
            Modules_NebulynkPlesk_Deployment::configureDomain($domainGuid);
        } elseif (in_array($operation, ['install', 'update', 'start', 'restart'], true)) {
            Modules_NebulynkPlesk_Deployment::configureDomain(
                $domainGuid,
                $operation === 'install' ? false : null
            );
        }

        if ($operation === 'proxy-on') {
            Modules_NebulynkPlesk_Deployment::configureDomain($domainGuid);
            Modules_NebulynkPlesk_Deployment::setProxyEnabled(true);
            $this->_status->addMessage('info', 'Der Plesk-Proxy wurde aktiviert.');
            return;
        }

        if ($operation === 'proxy-off') {
            Modules_NebulynkPlesk_Deployment::setProxyEnabled(false);
            $this->_status->addMessage('info', 'Der Plesk-Proxy wurde deaktiviert.');
            return;
        }

        if ($operation === 'status' || $operation === 'logs') {
            $output = Modules_NebulynkPlesk_Deployment::callHelper(
                $operation,
                [],
                pm_ApiCli::RESULT_STDOUT
            );
            if ($operation === 'status') {
                $this->view->runtimeStatus = is_string($output) ? $output : json_encode($output);
            } else {
                $this->view->runtimeLogs = is_string($output) ? $output : json_encode($output);
            }
            return;
        }

        if (!in_array($operation, $taskOperations, true)) {
            throw new pm_Exception('Unbekannte Nebulynk-Aktion.');
        }

        Modules_NebulynkPlesk_Deployment::startTask($operation, $operation === 'install');
        $message = in_array($operation, ['install', 'update'], true)
            ? 'Die Nebulynk-Installation wurde gestartet. Der erste Build kann mehrere Minuten dauern. Der Fortschritt wird in den Plesk-Aufgaben angezeigt.'
            : 'Die Nebulynk-Aufgabe wurde gestartet. Der Fortschritt wird in den Plesk-Aufgaben angezeigt.';
        $this->_status->addMessage('info', $message);
    }
}
