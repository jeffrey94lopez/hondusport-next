<?php
require_once 'auth.php';
header('Content-Type: application/json');

$tipo = preg_replace('/[^a-z]/', '', strtolower($_POST['tipo'] ?? 'productos'));
$id   = intval($_POST['id'] ?? 0);

if (!isset($_FILES['imagen']) || $_FILES['imagen']['error'] !== UPLOAD_ERR_OK) {
    echo json_encode(['error' => 'No se recibió archivo']); exit;
}

$file = $_FILES['imagen'];
if ($file['size'] > MAX_UPLOAD_SIZE) {
    echo json_encode(['error' => 'Archivo mayor a 2MB']); exit;
}

$allowed = ['image/jpeg','image/png','image/webp'];
if (!in_array($file['type'], $allowed)) {
    echo json_encode(['error' => 'Formato no permitido (JPG, PNG, WEBP)']); exit;
}

$ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
if (!in_array($ext, ['jpg','jpeg','png','webp'])) {
    echo json_encode(['error' => 'Extensión no permitida']); exit;
}

$filename = $id . '-' . time() . '.' . $ext;
$dir = __DIR__ . '/imgs/' . $tipo . '/' . $id . '/';
if (!is_dir($dir) && !mkdir($dir, 0755, true)) {
    echo json_encode(['error' => 'No se pudo crear directorio']); exit;
}

if (!move_uploaded_file($file['tmp_name'], $dir . $filename)) {
    echo json_encode(['error' => 'Error al guardar imagen']); exit;
}

echo json_encode([
    'success'  => true,
    'url'      => SITE_URL . '/admin-hs/imgs/' . $tipo . '/' . $id . '/' . $filename,
    'filename' => $filename
]);
