<?php
require_once 'auth.php';
header('Content-Type: application/json');

$tipo = preg_replace('/[^a-z]/', '', strtolower($_GET['tipo'] ?? 'productos'));
$id   = intval($_GET['id'] ?? 0);
$dir  = __DIR__ . '/imgs/' . $tipo . '/' . $id . '/';

if (!is_dir($dir)) { echo json_encode(['imgs' => []]); exit; }

$exts  = ['jpg','jpeg','png','webp'];
$files = array_values(array_filter(
    scandir($dir),
    fn($f) => in_array(strtolower(pathinfo($f, PATHINFO_EXTENSION)), $exts)
));

$base = SITE_URL . '/admin-hs/imgs/' . $tipo . '/' . $id . '/';
echo json_encode(['imgs' => array_map(fn($f) => ['filename' => $f, 'url' => $base . $f], $files)]);
