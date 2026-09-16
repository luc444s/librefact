<?php

declare(strict_types=1);

use Librefact\GreenterAdapter\Mapping\EmitDocumentRequestMapper;
use Librefact\GreenterAdapter\Xml\EmitDocumentXmlGenerator;
use PHPUnit\Framework\TestCase;

final class EmitDocumentXmlGeneratorTest extends TestCase
{
    public function testValidRequestGeneratesLocalUnsignedXml(): void
    {
        self::assertTrue(
            class_exists(EmitDocumentXmlGenerator::class),
            'The XML generator class Librefact\\GreenterAdapter\\Xml\\EmitDocumentXmlGenerator must exist before this contract can pass.'
        );

        $request = (new EmitDocumentRequestMapper())->fromPayload($this->validPayload());
        $xml = (new EmitDocumentXmlGenerator())->generate($request);

        self::assertIsString($xml);
        self::assertNotSame('', $xml);
        self::assertStringContainsString('<Invoice', $xml);
        self::assertStringContainsString('xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"', $xml);
        self::assertStringContainsString('<cbc:UBLVersionID>2.1</cbc:UBLVersionID>', $xml);
        self::assertStringContainsString('<cbc:CustomizationID schemeAgencyName="PE:SUNAT">2.0</cbc:CustomizationID>', $xml);
        self::assertStringContainsString('<cbc:ProfileID schemeName="SUNAT:Identificador de Tipo de Operación" schemeAgencyName="PE:SUNAT" schemeURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo51">0101</cbc:ProfileID>', $xml);
        self::assertStringContainsString('<cbc:ID>F001-1</cbc:ID>', $xml);
        self::assertStringContainsString('<cbc:IssueDate>2026-09-14</cbc:IssueDate>', $xml);
        self::assertStringContainsString('<cbc:InvoiceTypeCode listID="0101">01</cbc:InvoiceTypeCode>', $xml);
        self::assertStringContainsString('<cbc:DocumentCurrencyCode>PEN</cbc:DocumentCurrencyCode>', $xml);
        self::assertStringContainsString('<cbc:ID>FormaPago</cbc:ID>', $xml);
        self::assertStringContainsString('<cbc:PaymentMeansID>Contado</cbc:PaymentMeansID>', $xml);
        self::assertStringContainsString('20123456789', $xml);
        self::assertStringContainsString('LIBREFACT DEMO SAC', $xml);
        self::assertStringContainsString('<cbc:AddressTypeCode>0000</cbc:AddressTypeCode>', $xml);
        self::assertStringContainsString('20601234567', $xml);
        self::assertStringContainsString('CLIENTE DEMO SAC', $xml);
        self::assertStringContainsString('Servicio demo', $xml);
        self::assertStringContainsString('100.00', $xml);
        self::assertStringNotContainsString('<cbc:LineExtensionAmount currencyID="PEN">0.00</cbc:LineExtensionAmount>', $xml);
        self::assertStringContainsString('18.00', $xml);
        self::assertStringContainsString('118.00', $xml);
        self::assertStringNotContainsString('ds:' . 'Signature', $xml);

        $dom = new \DOMDocument();
        self::assertTrue($dom->loadXML($xml));
        self::assertSame('Invoice', $dom->documentElement->localName);
        self::assertSame('urn:oasis:names:specification:ubl:schema:xsd:Invoice-2', $dom->documentElement->namespaceURI);
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
