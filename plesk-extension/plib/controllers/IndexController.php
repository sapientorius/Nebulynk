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

        $cleanupForm = new pm_Form_Simple();
        $cleanupForm->addElement('hidden', 'cleanup_action', [
            'value' => '1',
        ]);
        $cleanupForm->addElement('text', 'cleanup_confirmation', [
            'label' => 'Bestätigung',
            'description' => 'Geben Sie exakt DELETE NEBULYNK DATA ein.',
            'required' => true,
            'validators' => [['NotEmpty', true]],
        ]);
        $cleanupForm->addControlButtons([
            'sendButton' => 'Alle Daten löschen',
            'cancelLink' => pm_Context::getModulesListUrl(),
        ]);

        $this->view->cleanupForm = $cleanupForm;
        $this->view->cleanupConfirmationPhrase = Modules_NebulynkPlesk_Deployment::CLEANUP_CONFIRMATION;
        $this->view->showCleanup = $this->canCleanup($this->view->state);

        if ($this->getRequest()->isPost()) {
            $post = $this->getRequest()->getPost();
            try {
                if ((string)($post['cleanup_action'] ?? '') === '1') {
                    if ($cleanupForm->isValid($post)) {
                        $this->handleCleanup((string)$cleanupForm->getValue('cleanup_confirmation'));
                    }
                } elseif ($form->isValid($post)) {
                    $operation = (string)$form->getValue('operation');
                    $this->handleOperation($operation, (string)$form->getValue('domain_guid'));
                }
            } catch (Throwable $exception) {
                $this->_status->addMessage('error', $exception->getMessage());
            }
        }

        $this->view->form = $form;
    }

    private function handleOperation(string $operation, string $domainGuid): void
    {
        if (Modules_NebulynkPlesk_Deployment::getState()['deployment_status'] === 'cleaning') {
            throw new pm_Exception('Die vollständige Löschung läuft bereits.');
        }

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

    private function handleCleanup(string $confirmation): void
    {
        if ($confirmation !== Modules_NebulynkPlesk_Deployment::CLEANUP_CONFIRMATION) {
            throw new pm_Exception('Die Cleanup-Bestätigung ist ungültig. Geben Sie exakt DELETE NEBULYNK DATA ein.');
        }

        $state = Modules_NebulynkPlesk_Deployment::getState();
        if (!$this->canCleanup($state)) {
            throw new pm_Exception('Die Cleanup-Aktion ist in diesem Zustand nicht verfügbar.');
        }

        Modules_NebulynkPlesk_Deployment::prepareCleanup();
        Modules_NebulynkPlesk_Deployment::setDeploymentStatus('cleaning');
        try {
            Modules_NebulynkPlesk_Deployment::startTask('cleanup');
        } catch (Throwable $exception) {
            Modules_NebulynkPlesk_Deployment::setDeploymentStatus('error');
            throw $exception;
        }

        $this->_status->addMessage(
            'info',
            'Die vollständige Löschung wurde gestartet. Der Fortschritt wird in den Plesk-Aufgaben angezeigt.'
        );
    }

    private function canCleanup(array $state): bool
    {
        return in_array($state['deployment_status'], ['configured', 'ready', 'running', 'stopped', 'error'], true);
    }
}
