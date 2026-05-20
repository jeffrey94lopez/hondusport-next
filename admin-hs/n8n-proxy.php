<?php
require_once 'auth.php';
header('Content-Type: application/json');

$body = file_get_contents('php://input');
if (!$body) { echo json_encode(['error' => 'Sin datos']); exit; }

$ch = curl_init(N8N_ADMIN_WEBHOOK);
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_TIMEOUT, 30);
$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$error = curl_error($ch);
curl_close($ch);

if ($error) {
    echo json_encode(['error' => 'Error conectando a n8n: ' . $error]);
} else {
    http_response_code($httpCode);
    echo $response;
}
