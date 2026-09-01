<?php

if (stripos(PHP_OS, 'WIN') === 0) {
    throw new pm_Exception('This Nebulynk extension only supports Plesk on Linux.');
}
