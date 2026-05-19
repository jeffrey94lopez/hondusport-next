<?php
require_once __DIR__ . '/config.php';
session_start();
if (!isset($_SESSION['hs_admin_auth'])) {
    http_response_code(401);
    header('Content-Type: application/json');
    echo json_encode(['error' => 'No autorizado']);
    exit;
}
