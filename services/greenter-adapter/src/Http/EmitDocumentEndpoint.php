<?php

declare(strict_types=1);

namespace Librefact\GreenterAdapter\Http;

use Librefact\GreenterAdapter\Mapping\EmitDocumentRequestMapper;
use Librefact\GreenterAdapter\Sunat\SunatInvoiceSender;
use Librefact\GreenterAdapter\Sunat\SunatSubmissionCredentials;
use Librefact\GreenterAdapter\Support\EnvFileLoader;
use Librefact\GreenterAdapter\Validation\EmitDocumentPayloadValidator;
use Librefact\GreenterAdapter\Xml\EmitDocumentXmlGenerator;
use Librefact\GreenterAdapter\Xml\EmitDocumentXmlSigner;

final class EmitDocumentEndpoint
{
    /**
     * @param array<string, mixed> $payload
     * @return array{status_code:int, body:array<string, mixed>}
     */
    public function handle(string $method, string $path, array $payload): array
    {
        if ($method !== 'POST' || $path !== '/documents/emit') {
            return [
                'status_code' => 404,
                'body' => [
                    'success' => false,
                    'status' => 'not_found',
                    'errors' => ['Endpoint not found.'],
                ],
            ];
        }

        $errors = (new EmitDocumentPayloadValidator())->validate($payload);
        if ($errors !== []) {
            return [
                'status_code' => 400,
                'body' => [
                    'success' => false,
                    'status' => 'invalid_request',
                    'provider' => 'PE_SUNAT_GREENTER',
                    'errors' => $errors,
                ],
            ];
        }

        $document = $payload['document'];

        $autoExecute = !empty($payload['auto_execute']);

        if (!$autoExecute) {
            return [
                'status_code' => 202,
                'body' => [
                    'success' => true,
                    'status' => 'received',
                    'provider' => 'PE_SUNAT_GREENTER',
                    'document' => [
                        'type' => $document['type'] ?? null,
                        'serie' => $document['serie'] ?? null,
                        'number' => $document['number'] ?? null,
                    ],
                    'xml' => null,
                    'cdr' => null,
                    'sunat_code' => null,
                    'sunat_description' => null,
                    'errors' => [],
                ],
            ];
        }

        return $this->executeFullPipeline($payload, $document);
    }

    /**
     * @param array<string, mixed> $payload
     * @param array<string, mixed> $document
     * @return array{status_code:int, body:array<string, mixed>}
     */
    private function executeFullPipeline(array $payload, array $document): array
    {
        $envFile = getenv('LIBREFACT_SUNAT_ENV_FILE') ?: '/app/.env.sunat';
        EnvFileLoader::load($envFile);

        $env = getenv('LIBREFACT_SUNAT_ENV') ?: 'beta';
        if ($env !== 'beta') {
            return [
                'status_code' => 400,
                'body' => [
                    'success' => false,
                    'status' => 'error',
                    'provider' => 'PE_SUNAT_GREENTER',
                    'document' => [
                        'type' => $document['type'] ?? null,
                        'serie' => $document['serie'] ?? null,
                        'number' => $document['number'] ?? null,
                    ],
                    'errors' => [['code' => 'ENV_NOT_BETA', 'message' => 'Solo se permite entorno beta en esta fase.']],
                ],
            ];
        }

        try {
            $request = (new EmitDocumentRequestMapper())->fromPayload($payload);

            $xmlGenerator = new EmitDocumentXmlGenerator();
            $unsignedXml = $xmlGenerator->generate($request);

            $certPath = getenv('LIBREFACT_SUNAT_CERT_PATH') ?: '';
            $certContent = '';
            if ($certPath !== '' && is_file($certPath)) {
                $certContent = file_get_contents($certPath) ?: '';
            }
            if ($certContent === '') {
                $certContent = getenv('LIBREFACT_SUNAT_CERT_PEM') ?: '';
            }
            if ($certContent === '') {
                return [
                    'status_code' => 500,
                    'body' => [
                        'success' => false,
                        'status' => 'error',
                        'provider' => 'PE_SUNAT_GREENTER',
                        'document' => [
                            'type' => $document['type'] ?? null,
                            'serie' => $document['serie'] ?? null,
                            'number' => $document['number'] ?? null,
                        ],
                        'errors' => [['code' => 'NO_CERTIFICATE', 'message' => 'Certificado de firma no encontrado.']],
                    ],
                ];
            }

            $signedXml = (new EmitDocumentXmlSigner())->sign($unsignedXml, $certContent);
            $signedHash = hash('sha256', $signedXml);

            $solUser = getenv('LIBREFACT_SUNAT_SOL_USER') ?: '';
            $solPassword = getenv('LIBREFACT_SUNAT_SOL_PASSWORD') ?: '';
            $ruc = $payload['issuer']['ruc'] ?? '';

            $credentials = new SunatSubmissionCredentials($ruc, $solUser, $solPassword);
            $sender = new SunatInvoiceSender();
            $docTypeCode = ($document['type'] ?? '') === 'invoice' ? '01' : '03';
            $result = $sender->sendSignedInvoice(
                $ruc . '-' . $docTypeCode . '-' . ($document['serie'] ?? '') . '-' . ($document['number'] ?? ''),
                $signedXml,
                $credentials
            );

            $xmlFilename = $payload['issuer']['ruc'] . '-01-' . ($document['serie'] ?? '') . '-' . ($document['number'] ?? '');

            if ($result->success()) {
                return [
                    'status_code' => 200,
                    'body' => [
                        'success' => true,
                        'status' => 'accepted',
                        'provider' => 'PE_SUNAT_GREENTER',
                        'document' => [
                            'type' => $document['type'] ?? null,
                            'serie' => $document['serie'] ?? null,
                            'number' => $document['number'] ?? null,
                        ],
                        'xml_filename' => $xmlFilename,
                        'xml_signed_hash' => $signedHash,
                        'cdr_zip_base64' => $result->cdrZip() !== null ? base64_encode($result->cdrZip()) : null,
                        'cdr_code' => $result->cdrCode(),
                        'cdr_description' => $result->cdrDescription(),
                        'cdr_notes' => $result->cdrNotes(),
                        'sunat_code' => null,
                        'sunat_description' => null,
                        'errors' => [],
                    ],
                ];
            }

            $errors = [];
            if ($result->errorCode() !== null) {
                $errors[] = ['code' => $result->errorCode(), 'message' => $result->errorMessage() ?? ''];
            }

            return [
                'status_code' => 200,
                'body' => [
                    'success' => false,
                    'status' => 'rejected',
                    'provider' => 'PE_SUNAT_GREENTER',
                    'document' => [
                        'type' => $document['type'] ?? null,
                        'serie' => $document['serie'] ?? null,
                        'number' => $document['number'] ?? null,
                    ],
                    'xml_filename' => $xmlFilename,
                    'xml_signed_hash' => $signedHash,
                    'cdr_zip_base64' => $result->cdrZip() !== null ? base64_encode($result->cdrZip()) : null,
                    'cdr_code' => $result->cdrCode(),
                    'cdr_description' => $result->cdrDescription(),
                    'cdr_notes' => $result->cdrNotes(),
                    'sunat_code' => $result->errorCode(),
                    'sunat_description' => $result->errorMessage(),
                    'errors' => $errors,
                ],
            ];
        } catch (\Throwable $e) {
            return [
                'status_code' => 500,
                'body' => [
                    'success' => false,
                    'status' => 'error',
                    'provider' => 'PE_SUNAT_GREENTER',
                    'document' => [
                        'type' => $document['type'] ?? null,
                        'serie' => $document['serie'] ?? null,
                        'number' => $document['number'] ?? null,
                    ],
                    'errors' => [['code' => 'PIPELINE_ERROR', 'message' => $e->getMessage()]],
                ],
            ];
        }
    }
}
