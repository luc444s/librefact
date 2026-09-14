<?php

declare(strict_types=1);

namespace Librefact\GreenterAdapter\Http;

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

        $document = $payload['document'] ?? [];

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
}
