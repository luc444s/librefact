<?php

declare(strict_types=1);

use Librefact\GreenterAdapter\Http\EmitDocumentEndpoint;
use PHPUnit\Framework\TestCase;

final class EmitDocumentPayloadValidationTest extends TestCase
{
    public function testMinimalInvoicePayloadIsAccepted(): void
    {
        $response = (new EmitDocumentEndpoint())->handle(
            'POST',
            '/documents/emit',
            $this->validPayload()
        );

        self::assertSame(202, $response['status_code']);
        self::assertSame('received', $response['body']['status']);
        self::assertSame([], $response['body']['errors']);
    }

    /**
     * @dataProvider invalidPayloadProvider
     *
     * @param callable(array<string, mixed>): array<string, mixed> $mutate
     */
    public function testInvalidPayloadsReturnFieldErrors(callable $mutate, string $expectedField): void
    {
        $response = (new EmitDocumentEndpoint())->handle(
            'POST',
            '/documents/emit',
            $mutate($this->validPayload())
        );

        self::assertSame(400, $response['status_code']);
        self::assertSame(false, $response['body']['success']);
        self::assertSame('invalid_request', $response['body']['status']);
        self::assertSame('PE_SUNAT_GREENTER', $response['body']['provider']);
        self::assertContains($expectedField, array_column($response['body']['errors'], 'field'));
    }

    /**
     * @return iterable<string, array{0: callable(array<string, mixed>): array<string, mixed>, 1: string}>
     */
    public function invalidPayloadProvider(): iterable
    {
        yield 'missing tax_authority.country' => [function (array $payload): array {
            unset($payload['tax_authority']['country']);

            return $payload;
        }, 'tax_authority.country'];

        yield 'unsupported tax_authority.country' => [function (array $payload): array {
            $payload['tax_authority']['country'] = 'CL';

            return $payload;
        }, 'tax_authority.country'];

        yield 'missing document.type' => [function (array $payload): array {
            unset($payload['document']['type']);

            return $payload;
        }, 'document.type'];

        yield 'unsupported document.type' => [function (array $payload): array {
            $payload['document']['type'] = 'boleta';

            return $payload;
        }, 'document.type'];

        yield 'missing issuer.ruc' => [function (array $payload): array {
            unset($payload['issuer']['ruc']);

            return $payload;
        }, 'issuer.ruc'];

        yield 'invalid issuer.ruc' => [function (array $payload): array {
            $payload['issuer']['ruc'] = '2012345678A';

            return $payload;
        }, 'issuer.ruc'];

        yield 'missing customer.document_number' => [function (array $payload): array {
            unset($payload['customer']['document_number']);

            return $payload;
        }, 'customer.document_number'];

        yield 'empty items' => [function (array $payload): array {
            $payload['items'] = [];

            return $payload;
        }, 'items'];

        yield 'missing items[0].description' => [function (array $payload): array {
            unset($payload['items'][0]['description']);

            return $payload;
        }, 'items[0].description'];

        yield 'invalid item arithmetic' => [function (array $payload): array {
            $payload['items'][0]['total'] = 117;

            return $payload;
        }, 'items[0].total'];

        yield 'missing totals.total' => [function (array $payload): array {
            unset($payload['totals']['total']);

            return $payload;
        }, 'totals.total'];

        yield 'invalid totals arithmetic' => [function (array $payload): array {
            $payload['totals']['total'] = 117;

            return $payload;
        }, 'totals.total'];
    }

    /**
     * @return array<string, mixed>
     */
    private function validPayload(): array
    {
        return json_decode(
            file_get_contents(__DIR__ . '/fixtures/emit_invoice_minimal.json'),
            true,
            512,
            JSON_THROW_ON_ERROR
        );
    }
}
