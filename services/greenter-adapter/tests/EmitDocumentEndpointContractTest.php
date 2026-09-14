<?php

declare(strict_types=1);

use Librefact\GreenterAdapter\Http\EmitDocumentEndpoint;
use PHPUnit\Framework\TestCase;

final class EmitDocumentEndpointContractTest extends TestCase
{
    public function testMinimalInvoicePayloadReturnsReceivedResponse(): void
    {
        self::assertTrue(
            class_exists(EmitDocumentEndpoint::class),
            'The endpoint class Librefact\\GreenterAdapter\\Http\\EmitDocumentEndpoint must exist before this contract can pass.'
        );

        $payload = json_decode(
            file_get_contents(__DIR__ . '/fixtures/emit_invoice_minimal.json'),
            true,
            512,
            JSON_THROW_ON_ERROR
        );

        $endpoint = new EmitDocumentEndpoint();
        $response = $endpoint->handle('POST', '/documents/emit', $payload);

        self::assertSame(202, $response['status_code']);
        self::assertSame([
            'success' => true,
            'status' => 'received',
            'provider' => 'PE_SUNAT_GREENTER',
            'document' => [
                'type' => 'invoice',
                'serie' => 'F001',
                'number' => 1,
            ],
            'xml' => null,
            'cdr' => null,
            'sunat_code' => null,
            'sunat_description' => null,
            'errors' => [],
        ], $response['body']);
    }
}
