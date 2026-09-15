<?php

declare(strict_types=1);

use Greenter\XMLSecLibs\Sunat\SignedXml;
use Librefact\GreenterAdapter\Mapping\EmitDocumentRequestMapper;
use Librefact\GreenterAdapter\Xml\EmitDocumentXmlGenerator;
use Librefact\GreenterAdapter\Xml\EmitDocumentXmlSigner;
use PHPUnit\Framework\TestCase;

final class EmitDocumentXmlSignerTest extends TestCase
{
    public function testUnsignedXmlCanBeSignedWithTestCertificate(): void
    {
        self::assertTrue(
            class_exists(EmitDocumentXmlSigner::class),
            'The XML signer class Librefact\\GreenterAdapter\\Xml\\EmitDocumentXmlSigner must exist before this contract can pass.'
        );

        $request = (new EmitDocumentRequestMapper())->fromPayload($this->validPayload());
        $unsignedXml = (new EmitDocumentXmlGenerator())->generate($request);
        $signedXml = (new EmitDocumentXmlSigner())->sign($unsignedXml, $this->testCertificatePem());

        self::assertIsString($signedXml);
        self::assertNotSame('', $signedXml);
        self::assertStringContainsString('<ds:Signature', $signedXml);
        self::assertStringContainsString('<ds:SignedInfo', $signedXml);
        self::assertStringContainsString('<ds:SignatureValue', $signedXml);
        self::assertStringContainsString('<ds:X509Certificate', $signedXml);
        self::assertStringContainsString('<cbc:ID>F001-1</cbc:ID>', $signedXml);
        self::assertStringContainsString('<cbc:IssueDate>2026-09-14</cbc:IssueDate>', $signedXml);
        self::assertStringContainsString('20123456789', $signedXml);
        self::assertStringContainsString('LIBREFACT DEMO SAC', $signedXml);
        self::assertStringContainsString('20601234567', $signedXml);
        self::assertStringContainsString('CLIENTE DEMO SAC', $signedXml);
        self::assertStringContainsString('Servicio demo', $signedXml);

        $dom = new \DOMDocument();
        self::assertTrue($dom->loadXML($signedXml));
        self::assertSame('Invoice', $dom->documentElement->localName);
        self::assertTrue((new SignedXml())->verifyXml($signedXml));
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

    private function testCertificatePem(): string
    {
        $key = openssl_pkey_new([
            'private_key_bits' => 2048,
            'private_key_type' => OPENSSL_KEYTYPE_RSA,
        ]);

        self::assertNotFalse($key);

        $csr = openssl_csr_new(['commonName' => 'LIBREFACT TEST'], $key);
        self::assertNotFalse($csr);

        $certificate = openssl_csr_sign($csr, null, $key, 1);
        self::assertNotFalse($certificate);

        $certificatePem = '';
        $privateKeyPem = '';
        self::assertTrue(openssl_x509_export($certificate, $certificatePem));
        self::assertTrue(openssl_pkey_export($key, $privateKeyPem));

        return $certificatePem . $privateKeyPem;
    }
}
