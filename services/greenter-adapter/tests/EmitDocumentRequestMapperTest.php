<?php

declare(strict_types=1);

use Librefact\GreenterAdapter\Domain\EmitDocumentRequest;
use Librefact\GreenterAdapter\Mapping\EmitDocumentRequestMapper;
use PHPUnit\Framework\TestCase;

final class EmitDocumentRequestMapperTest extends TestCase
{
    public function testValidPayloadMapsToEmitDocumentRequest(): void
    {
        self::assertTrue(
            class_exists(EmitDocumentRequestMapper::class),
            'The mapper class Librefact\\GreenterAdapter\\Mapping\\EmitDocumentRequestMapper must exist before this contract can pass.'
        );

        $request = (new EmitDocumentRequestMapper())->fromPayload($this->validPayload());

        self::assertInstanceOf(EmitDocumentRequest::class, $request);
        self::assertSame('PE', $request->taxAuthority->country);
        self::assertSame('SUNAT', $request->taxAuthority->code);
        self::assertSame('greenter', $request->taxAuthority->provider);

        self::assertSame('invoice', $request->document->type);
        self::assertSame('F001', $request->document->serie);
        self::assertSame(1, $request->document->number);
        self::assertSame('PEN', $request->document->currency);
        self::assertSame('2026-09-14', $request->document->issueDate);

        self::assertSame('20123456789', $request->issuer->ruc);
        self::assertSame('LIBREFACT DEMO SAC', $request->issuer->legalName);
        self::assertNotNull($request->issuer->address);
        self::assertSame('0000', $request->issuer->address->codLocal);

        self::assertSame('6', $request->customer->documentType);
        self::assertSame('20601234567', $request->customer->documentNumber);
        self::assertSame('CLIENTE DEMO SAC', $request->customer->legalName);

        self::assertCount(1, $request->items);
        self::assertSame('Servicio demo', $request->items[0]->description);
        self::assertSame(1.0, $request->items[0]->quantity);
        self::assertSame(100.0, $request->items[0]->unitValue);
        self::assertSame(18.0, $request->items[0]->igv);
        self::assertSame(118.0, $request->items[0]->total);

        self::assertSame(100.0, $request->totals->taxable);
        self::assertSame(18.0, $request->totals->igv);
        self::assertSame(118.0, $request->totals->total);
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
