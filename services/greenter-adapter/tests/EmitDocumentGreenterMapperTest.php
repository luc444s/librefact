<?php

declare(strict_types=1);

use Greenter\Model\Client\Client;
use Greenter\Model\Company\Company;
use Greenter\Model\Sale\Invoice;
use Greenter\Model\Sale\SaleDetail;
use Librefact\GreenterAdapter\Mapping\EmitDocumentGreenterMapper;
use Librefact\GreenterAdapter\Mapping\EmitDocumentRequestMapper;
use PHPUnit\Framework\TestCase;

final class EmitDocumentGreenterMapperTest extends TestCase
{
    public function testInternalRequestMapsToGreenterInvoice(): void
    {
        self::assertTrue(
            class_exists(EmitDocumentGreenterMapper::class),
            'The mapper class Librefact\\GreenterAdapter\\Mapping\\EmitDocumentGreenterMapper must exist before this contract can pass.'
        );

        $request = (new EmitDocumentRequestMapper())->fromPayload($this->validPayload());
        $invoice = (new EmitDocumentGreenterMapper())->toInvoice($request);

        self::assertInstanceOf(Invoice::class, $invoice);
        self::assertSame('2.1', $invoice->getUblVersion());
        self::assertSame('0101', $invoice->getTipoOperacion());
        self::assertSame('01', $invoice->getTipoDoc());
        self::assertSame('F001', $invoice->getSerie());
        self::assertSame('1', $invoice->getCorrelativo());
        self::assertInstanceOf(\DateTimeInterface::class, $invoice->getFechaEmision());
        self::assertSame('2026-09-14', $invoice->getFechaEmision()->format('Y-m-d'));
        self::assertSame('PEN', $invoice->getTipoMoneda());

        self::assertInstanceOf(Company::class, $invoice->getCompany());
        self::assertSame('20123456789', $invoice->getCompany()->getRuc());
        self::assertSame('LIBREFACT DEMO SAC', $invoice->getCompany()->getRazonSocial());
        self::assertNotNull($invoice->getCompany()->getAddress());
        self::assertSame('0000', $invoice->getCompany()->getAddress()->getCodLocal());

        self::assertInstanceOf(Client::class, $invoice->getClient());
        self::assertSame('6', $invoice->getClient()->getTipoDoc());
        self::assertSame('20601234567', $invoice->getClient()->getNumDoc());
        self::assertSame('CLIENTE DEMO SAC', $invoice->getClient()->getRznSocial());

        self::assertNotNull($invoice->getFormaPago());
        self::assertSame('Contado', $invoice->getFormaPago()->getTipo());

        self::assertCount(1, $invoice->getDetails());
        self::assertInstanceOf(SaleDetail::class, $invoice->getDetails()[0]);

        $detail = $invoice->getDetails()[0];
        self::assertSame('ZZ', $detail->getUnidad());
        self::assertSame('SERVICE', $detail->getCodProducto());
        self::assertSame('Servicio demo', $detail->getDescripcion());
        self::assertSame(1.0, $detail->getCantidad());
        self::assertSame(100.0, $detail->getMtoValorUnitario());
        self::assertSame(100.0, $detail->getMtoBaseIgv());
        self::assertSame(18.0, $detail->getPorcentajeIgv());
        self::assertSame(18.0, $detail->getIgv());
        self::assertSame('10', $detail->getTipAfeIgv());
        self::assertSame(18.0, $detail->getTotalImpuestos());
        self::assertSame(118.0, $detail->getMtoPrecioUnitario());
        self::assertSame(100.0, $detail->getMtoValorVenta());

        self::assertSame(100.0, $invoice->getMtoOperGravadas());
        self::assertSame(100.0, $invoice->getValorVenta());
        self::assertSame(118.0, $invoice->getSubTotal());
        self::assertSame(18.0, $invoice->getMtoIGV());
        self::assertSame(18.0, $invoice->getTotalImpuestos());
        self::assertSame(118.0, $invoice->getMtoImpVenta());
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
