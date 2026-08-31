<?php

if (stripos(PHP_OS, 'WIN') === 0) {
    throw new pm_Exception('Diese Nebulynk-Extension unterstützt nur Plesk auf Linux.');
}
