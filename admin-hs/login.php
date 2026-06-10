<?php
require_once 'config.php';
session_start();
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if (isset($_POST['password']) && $_POST['password'] === ADMIN_PASSWORD) {
        $_SESSION['hs_admin_auth'] = true;
        header('Location: dashboard.html');
    } else {
        header('Location: index.php?error=1');
    }
    exit;
}
header('Location: index.php');
exit;
