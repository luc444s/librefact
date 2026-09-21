<?php

declare(strict_types=1);

require_once __DIR__ . '/vendor/autoload.php';

use Librefact\GreenterAdapter\Http\EmitDocumentEndpoint;
use Librefact\GreenterAdapter\Support\EnvFileLoader;

$projectRoot = dirname(__DIR__, 2);
EnvFileLoader::load($projectRoot . '/.env');

if (getenv('LIBREFACT_SUNAT_CERT_PATH') === false && getenv('LIBREFACT_SUNAT_CERTIFICATE_PEM_PATH') !== false) {
    putenv('LIBREFACT_SUNAT_CERT_PATH=' . getenv('LIBREFACT_SUNAT_CERTIFICATE_PEM_PATH'));
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
$payload = json_decode(file_get_contents('php://input'), true) ?? [];

try {
    $endpoint = new EmitDocumentEndpoint();
    $result = $endpoint->handle($method, $path, $payload);
    http_response_code($result['status_code']);
    header('Content-Type: application/json');
    echo json_encode($result['body']);
} catch (\Throwable $e) {
    http_response_code(500);
    header('Content-Type: application/json');
    echo json_encode([
        'success' => false,
        'status' => 'error',
        'provider' => 'PE_SUNAT_GREENTER',
        'errors' => [['code' => 'ROUTER_ERROR', 'message' => $e->getMessage()]],
    ]);
}
