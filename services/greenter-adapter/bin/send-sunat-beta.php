<?php

declare(strict_types=1);

use Greenter\XMLSecLibs\Sunat\SignedXml;
use Librefact\GreenterAdapter\Mapping\EmitDocumentRequestMapper;
use Librefact\GreenterAdapter\Sunat\SunatInvoiceSender;
use Librefact\GreenterAdapter\Sunat\SunatSubmissionCredentials;
use Librefact\GreenterAdapter\Support\EnvFileLoader;
use Librefact\GreenterAdapter\Xml\EmitDocumentXmlGenerator;
use Librefact\GreenterAdapter\Xml\EmitDocumentXmlSigner;

require __DIR__ . '/../vendor/autoload.php';

EnvFileLoader::load(dirname(__DIR__, 3) . '/.env');

if (getenv('LIBREFACT_ALLOW_REAL_SUNAT_BETA_SEND') !== '1') {
    fwrite(STDERR, "Refusing to send. Set LIBREFACT_ALLOW_REAL_SUNAT_BETA_SEND=1 for an explicit SUNAT beta smoke test.\n");
    exit(2);
}

$env = requiredEnv('LIBREFACT_SUNAT_ENV');
$endpoint = requiredEnv('LIBREFACT_SUNAT_ENDPOINT');

if ($env !== 'beta' || strpos($endpoint, 'e-beta.sunat.gob.pe') === false) {
    fwrite(STDERR, "Refusing to send. Only SUNAT beta endpoint is allowed by this script.\n");
    exit(2);
}

if (!extension_loaded('soap')) {
    fwrite(STDERR, "PHP extension ext-soap must be installed/enabled to call SUNAT beta via Greenter SoapClient.\n");
    exit(2);
}

$ruc = requiredEnv('LIBREFACT_SUNAT_RUC');
$serie = requiredEnv('LIBREFACT_SUNAT_DOCUMENT_SERIE');
$correlative = (int) requiredEnv('LIBREFACT_SUNAT_DOCUMENT_CORRELATIVE');
$certificatePath = requiredEnv('LIBREFACT_SUNAT_CERTIFICATE_PEM_PATH');
$certificatePem = file_get_contents($certificatePath);

if ($certificatePem === false || $certificatePem === '') {
    fwrite(STDERR, "Certificate PEM is missing or unreadable.\n");
    exit(2);
}

$payload = [
    'tax_authority' => [
        'country' => 'PE',
        'code' => 'SUNAT',
        'provider' => 'greenter',
    ],
    'document' => [
        'type' => 'invoice',
        'serie' => $serie,
        'number' => $correlative,
        'currency' => 'PEN',
        'issue_date' => date('Y-m-d'),
    ],
    'issuer' => [
        'ruc' => $ruc,
        'legal_name' => getenv('LIBREFACT_SUNAT_ISSUER_LEGAL_NAME') ?: 'LIBREFACT BETA TEST',
        'address' => [
            'ubigueo' => getenv('LIBREFACT_SUNAT_ISSUER_UBIGEO') ?: null,
            'codigo_pais' => 'PE',
            'departamento' => getenv('LIBREFACT_SUNAT_ISSUER_DEPARTAMENTO') ?: null,
            'provincia' => getenv('LIBREFACT_SUNAT_ISSUER_PROVINCIA') ?: null,
            'distrito' => getenv('LIBREFACT_SUNAT_ISSUER_DISTRITO') ?: null,
            'direccion' => getenv('LIBREFACT_SUNAT_ISSUER_DIRECCION') ?: null,
            'cod_local' => getenv('LIBREFACT_SUNAT_ISSUER_COD_LOCAL') ?: '0000',
        ],
    ],
    'customer' => [
        'document_type' => getenv('LIBREFACT_SUNAT_CUSTOMER_DOCUMENT_TYPE') ?: '6',
        'document_number' => getenv('LIBREFACT_SUNAT_CUSTOMER_DOCUMENT_NUMBER') ?: '20000000001',
        'legal_name' => getenv('LIBREFACT_SUNAT_CUSTOMER_LEGAL_NAME') ?: 'CLIENTE BETA SUNAT',
    ],
    'items' => [[
        'description' => 'Servicio beta Librefact',
        'quantity' => 1,
        'unit_value' => 100,
        'igv' => 18,
        'total' => 118,
    ]],
    'totals' => [
        'taxable' => 100,
        'igv' => 18,
        'total' => 118,
    ],
];

$request = (new EmitDocumentRequestMapper())->fromPayload($payload);
$unsignedXml = (new EmitDocumentXmlGenerator())->generate($request);
$signedXml = (new EmitDocumentXmlSigner())->sign($unsignedXml, $certificatePem);

if (!(new SignedXml())->verifyXml($signedXml)) {
    fwrite(STDERR, "Signed XML verification failed before SUNAT send.\n");
    exit(1);
}

$filename = sprintf('%s-01-%s-%d', $ruc, $serie, $correlative);

printf("ENV: %s\n", $env);
printf("ENDPOINT: %s\n", $endpoint);
printf("RUC: %s\n", maskRuc($ruc));
printf("DOCUMENT: %s\n", $filename);

$result = (new SunatInvoiceSender())->sendSignedInvoice(
    $filename,
    $signedXml,
    new SunatSubmissionCredentials(
        $ruc,
        requiredEnv('LIBREFACT_SUNAT_SOL_USER'),
        requiredEnv('LIBREFACT_SUNAT_SOL_PASSWORD'),
        $endpoint
    )
);

printf("SUCCESS: %s\n", $result->success() ? 'yes' : 'no');

if ($result->cdrCode() !== null || $result->cdrDescription() !== null) {
    printf("CDR_CODE: %s\n", (string) $result->cdrCode());
    printf("CDR_DESCRIPTION: %s\n", (string) $result->cdrDescription());
    foreach ($result->cdrNotes() as $note) {
        printf("CDR_NOTE: %s\n", $note);
    }
}

if (!$result->success()) {
    printf("ERROR_CODE: %s\n", (string) $result->errorCode());
    printf("ERROR_MESSAGE: %s\n", (string) $result->errorMessage());
    exit(1);
}

function requiredEnv(string $name): string
{
    $value = getenv($name);
    if (!is_string($value) || $value === '') {
        fwrite(STDERR, sprintf("%s must be set.\n", $name));
        exit(2);
    }

    return $value;
}

function maskRuc(string $ruc): string
{
    if (strlen($ruc) <= 4) {
        return '****';
    }

    return substr($ruc, 0, 2) . str_repeat('*', max(0, strlen($ruc) - 4)) . substr($ruc, -2);
}
