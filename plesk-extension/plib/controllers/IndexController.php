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

        $form = new pm_Form_Simple([
            'name' => 'nebulynkActionForm',
        ]);
        $form->setAttrib('id', 'nebulynkActionForm');
        $form->addElement('select', 'domain_guid', [
            'label' => 'Plesk domain',
            'multiOptions' => ['' => 'Please select'] + $this->view->domains,
            'value' => $this->view->state['domain_guid'],
            'required' => true,
            'validators' => [['NotEmpty', true]],
        ]);
        $form->addElement('select', 'operation', [
            'label' => 'Action',
            'multiOptions' => [
                'preflight' => '1. Run preflight check (recommended)',
                'install' => '2. Install and build',
                'update' => 'Update and rebuild',
                'start' => 'Start',
                'stop' => 'Stop',
                'restart' => 'Restart',
                'status' => 'Show container status',
                'logs' => 'Show latest logs',
                'proxy-on' => 'Enable Plesk proxy',
                'proxy-off' => 'Disable Plesk proxy',
            ],
            'value' => 'preflight',
            'required' => true,
        ]);
        $form->addControlButtons([
            'sendTitle' => 'Run action',
            'cancelTitle' => 'Cancel',
            'cancelLink' => pm_Context::getModulesListUrl(),
        ]);

        $cleanupForm = new pm_Form_Simple([
            'name' => 'nebulynkCleanupForm',
        ]);
        $cleanupForm->setAttrib('id', 'nebulynkCleanupForm');
        $cleanupForm->addElement('hidden', 'cleanup_action', [
            'value' => '1',
        ]);
        $cleanupForm->addElement('text', 'cleanup_confirmation', [
            'label' => 'Confirmation',
            'description' => 'Enter DELETE NEBULYNK DATA exactly.',
            'required' => true,
            'validators' => [['NotEmpty', true]],
        ]);
        $cleanupForm->addControlButtons([
            'sendTitle' => 'Delete all data',
            'cancelTitle' => 'Cancel',
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
            throw new pm_Exception('Complete deletion is already in progress.');
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
            $this->_status->addMessage('info', 'The Plesk proxy has been enabled.');
            return;
        }

        if ($operation === 'proxy-off') {
            Modules_NebulynkPlesk_Deployment::setProxyEnabled(false);
            $this->_status->addMessage('info', 'The Plesk proxy has been disabled.');
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
            throw new pm_Exception('Unknown Nebulynk action.');
        }

        Modules_NebulynkPlesk_Deployment::startTask($operation, $operation === 'install');
        $message = in_array($operation, ['install', 'update'], true)
            ? 'Nebulynk installation started. The first build may take several minutes. Progress is shown in Plesk Tasks.'
            : 'Nebulynk task started. Progress is shown in Plesk Tasks.';
        $this->_status->addMessage('info', $message);
    }

    private function handleCleanup(string $confirmation): void
    {
        if ($confirmation !== Modules_NebulynkPlesk_Deployment::CLEANUP_CONFIRMATION) {
            throw new pm_Exception('The cleanup confirmation is invalid. Enter DELETE NEBULYNK DATA exactly.');
        }

        $state = Modules_NebulynkPlesk_Deployment::getState();
        if (!$this->canCleanup($state)) {
            throw new pm_Exception('Cleanup is not available in the current state.');
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
            'Complete deletion started. Progress is shown in Plesk Tasks.'
        );
    }

    private function canCleanup(array $state): bool
    {
        return in_array($state['deployment_status'], ['configured', 'ready', 'running', 'stopped', 'error'], true);
    }
}
