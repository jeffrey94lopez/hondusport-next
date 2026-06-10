<?php
session_start();
if (isset($_SESSION['hs_admin_auth'])) {
    header('Location: dashboard.html');
    exit;
}
$error = isset($_GET['error']);
?><!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Hondusport Admin</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:#0f0f0f;color:#eee;font-family:Inter,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh}
  .box{background:#1a1a1a;border:1px solid #333;border-radius:12px;padding:2.5rem;width:340px}
  h1{color:#C9A84C;font-size:1.4rem;letter-spacing:2px;margin-bottom:.5rem}
  p{opacity:.6;font-size:.85rem;margin-bottom:2rem}
  input{width:100%;background:#111;border:1px solid #333;color:#eee;padding:.75rem 1rem;border-radius:6px;font-size:.95rem;margin-bottom:1rem}
  button{width:100%;background:#C9A84C;color:#000;border:none;padding:.85rem;border-radius:6px;font-weight:700;font-size:.95rem;cursor:pointer;letter-spacing:1px}
  .error{background:#2a0000;border:1px solid #ff4444;color:#ff6666;padding:.75rem 1rem;border-radius:6px;font-size:.85rem;margin-bottom:1rem}
</style>
</head>
<body>
<div class="box">
  <h1>HONDUSPORT</h1>
  <p>Panel de Administración</p>
  <?php if($error): ?><div class="error">Contraseña incorrecta.</div><?php endif; ?>
  <form method="POST" action="login.php">
    <input type="password" name="password" placeholder="CONTRASEÑA" required autofocus>
    <button type="submit">INGRESAR</button>
  </form>
</div>
</body>
</html>
