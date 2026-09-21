<?php

declare(strict_types=1);

require_once dirname(__DIR__) . '/vendor/autoload.php';

use Librefact\GreenterAdapter\Http\EmitDocumentEndpoint;
use Librefact\GreenterAdapter\Support\EnvFileLoader;

$projectRoot = dirname(__DIR__, 3);
EnvFileLoader::load($projectRoot . '/.env');

if (getenv('LIBREFACT_SUNAT_CERT_PATH') === false && getenv('LIBREFACT_SUNAT_CERTIFICATE_PEM_PATH') !== false) {
    putenv('LIBREFACT_SUNAT_CERT_PATH=' . getenv('LIBREFACT_SUNAT_CERTIFICATE_PEM_PATH'));
}

$jsonFile = $argv[1] ?? null;
if ($jsonFile === null || !is_file($jsonFile)) {
    fwrite(STDERR, "Usage: php emit-inline.php <payload.json>\n");
    exit(1);
}

$payload = json_decode(file_get_contents($jsonFile), true);
if (!is_array($payload)) {
    fwrite(STDERR, "Invalid JSON payload\n");
    exit(1);
}

$endpoint = new EmitDocumentEndpoint();
$result = $endpoint->handle('POST', '/documents/emit', $payload);

$body = $result['body'];

echo json_encode($body);
