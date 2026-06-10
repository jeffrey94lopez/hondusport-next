<?php
require_once 'auth.php';
header('Content-Type: application/json');

$body    = json_decode(file_get_contents('php://input'), true);
$tipo    = preg_replace('/[^a-z]/', '', strtolower($body['tipo'] ?? 'productos'));
$id      = intval($body['id'] ?? 0);
$filename = basename($body['filename'] ?? '');

if (!$filename) { echo json_encode(['error' => 'Filename inválido']); exit; }

$path = __DIR__ . '/imgs/' . $tipo . '/' . $id . '/' . $filename;
if (!file_exists($path)) { echo json_encode(['error' => 'Archivo no encontrado']); exit; }

unlink($path);
echo json_encode(['success' => true]);
