<?php

class IndexController extends pm_Controller_Action
{
    protected $_accessLevel = 'admin';

    private const RUNTIME_OUTPUT_SESSION_KEY = 'runtime_output';

    public function indexAction()
    {
        $this->view->pageTitle = 'Nebulynk';
        $this->view->state = Modules_NebulynkPlesk_Deployment::getState();
        $this->view->domains = Modules_NebulynkPlesk_Deployment::getAvailableDomains();
        $this->view->runtimeOutput = $this->consumeRuntimeOutput();

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
            'cancelHidden' => true,
        ]);
        $form->getElement('send')->setAttrib('id', 'nebulynkActionSubmit');

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
            'cancelHidden' => true,
        ]);
        $cleanupForm->getElement('send')->setAttrib('id', 'nebulynkCleanupSubmit');

        $this->view->cleanupForm = $cleanupForm;
        $this->view->cleanupConfirmationPhrase = Modules_NebulynkPlesk_Deployment::CLEANUP_CONFIRMATION;
        $this->view->showCleanup = $this->canCleanup($this->view->state);

        if ($this->getRequest()->isPost()) {
            $post = $this->getRequest()->getPost();
            $redirectAfterPost = false;
            try {
                if ((string)($post['cleanup_action'] ?? '') === '1') {
                    if ($cleanupForm->isValid($post)) {
                        $redirectAfterPost = true;
                        $this->handleCleanup((string)$cleanupForm->getValue('cleanup_confirmation'));
                    }
                } elseif ($form->isValid($post)) {
                    $redirectAfterPost = true;
                    $operation = (string)$form->getValue('operation');
                    $this->handleOperation($operation, (string)$form->getValue('domain_guid'));
                }
            } catch (Throwable $exception) {
                $this->_status->addMessage('error', $exception->getMessage());
            }

            if ($redirectAfterPost) {
                $this->_helper->json(['redirect' => pm_Context::getBaseUrl()]);
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
            $result = Modules_NebulynkPlesk_Deployment::callHelper($operation);
            $output = is_array($result) && isset($result['stdout'])
                ? (string)$result['stdout']
                : '';
            $isStatus = $operation === 'status';
            if (trim($output) === '') {
                $output = $isStatus
                    ? 'No Nebulynk containers are currently present.'
                    : 'No log entries are available yet.';
            }

            $this->storeRuntimeOutput(
                $isStatus ? 'Container status' : 'Latest logs',
                $output
            );
            $this->_status->addMessage(
                'info',
                $isStatus
                    ? 'Container status retrieved. See the result below.'
                    : 'Latest logs retrieved. See the result below.'
            );
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

    private function consumeRuntimeOutput(): ?array
    {
        $output = $_SESSION['module'][Modules_NebulynkPlesk_Deployment::MODULE_ID][self::RUNTIME_OUTPUT_SESSION_KEY] ?? null;
        unset($_SESSION['module'][Modules_NebulynkPlesk_Deployment::MODULE_ID][self::RUNTIME_OUTPUT_SESSION_KEY]);

        if (!is_array($output)
            || !isset($output['title'], $output['content'])
            || !is_string($output['title'])
            || !is_string($output['content'])) {
            return null;
        }

        return $output;
    }

    private function storeRuntimeOutput(string $title, string $content): void
    {
        $_SESSION['module'][Modules_NebulynkPlesk_Deployment::MODULE_ID][self::RUNTIME_OUTPUT_SESSION_KEY] = [
            'title' => $title,
            'content' => $content,
        ];
    }

    private function canCleanup(array $state): bool
    {
        return in_array($state['deployment_status'], ['configured', 'ready', 'running', 'stopped', 'error'], true);
    }
}
